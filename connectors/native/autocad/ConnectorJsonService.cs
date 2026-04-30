using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace CableTrayRoute.AutoCADConnector
{
    public sealed class ValidationResult
    {
        public bool IsValid => Errors.Count == 0;
        public List<string> Errors { get; } = new List<string>();
        public List<string> Warnings { get; } = new List<string>();
    }

    internal sealed class AutoCadConnectorElementRow
    {
        public string Guid { get; set; }
        public string SourceId { get; set; }
        public string SourceFile { get; set; }
        public string ElementType { get; set; }
        public string Tag { get; set; }
        public string Name { get; set; }
        public string Level { get; set; }
        public string Area { get; set; }
        public string System { get; set; }
        public string Dimensions { get; set; }
        public double Quantity { get; set; }
        public double LengthFt { get; set; }
        public string MappedProjectId { get; set; }
        public Dictionary<string, string> SourceProperties { get; } = new Dictionary<string, string>();
        public List<string> PropertySets { get; } = new List<string>();
        public List<string> Issues { get; } = new List<string>();
        public List<string> Warnings { get; } = new List<string>();
    }

    public sealed class ConnectorJsonService
    {
        public string ContractVersion => ConnectorContract.ContractVersion;

        public string BuildConnectorJson(Database database, string drawingName)
        {
            if (database == null) throw new ArgumentNullException(nameof(database));
            var rows = CollectConnectorRows(database, drawingName ?? string.Empty).ToList();
            var now = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            var builder = new StringBuilder();
            builder.Append("{");
            JsonProperty(builder, "version", ConnectorContract.ContractVersion, true);
            JsonProperty(builder, "connectorType", "autocad");
            JsonProperty(builder, "sourceApplication", "AutoCAD CableTrayRoute Add-In");
            JsonProperty(builder, "sourceVersion", "AutoCAD .NET bridge");
            JsonProperty(builder, "projectId", string.IsNullOrWhiteSpace(drawingName) ? "AutoCAD Drawing" : Path.GetFileNameWithoutExtension(drawingName));
            JsonProperty(builder, "scenario", "AutoCAD Export");
            JsonProperty(builder, "createdAt", now);
            builder.Append(",\"elements\":[");
            for (var index = 0; index < rows.Count; index += 1)
            {
                if (index > 0) builder.Append(",");
                AppendElementRow(builder, rows[index]);
            }
            builder.Append("],\"quantities\":[],\"issues\":[],\"propertySets\":[],\"mappingHints\":[],");
            builder.Append("\"warnings\":[\"Review-only AutoCAD export. Validate and preview in CableTrayRoute before accepting BIM coordination records.\"],");
            builder.Append("\"assumptions\":[\"Exported from SDK-ready local AutoCAD add-in source; no AutoCAD drawing mutation is performed.\"]");
            builder.Append("}");
            return builder.ToString();
        }

        private static IEnumerable<AutoCadConnectorElementRow> CollectConnectorRows(Database database, string drawingName)
        {
            using (var transaction = database.TransactionManager.StartTransaction())
            {
                var blockTable = (BlockTable)transaction.GetObject(database.BlockTableId, OpenMode.ForRead);
                var modelSpace = (BlockTableRecord)transaction.GetObject(blockTable[BlockTableRecord.ModelSpace], OpenMode.ForRead);
                foreach (ObjectId objectId in modelSpace)
                {
                    var entity = transaction.GetObject(objectId, OpenMode.ForRead, false) as Entity;
                    if (entity == null) continue;
                    yield return BuildElementRow(transaction, entity, drawingName);
                }
                transaction.Commit();
            }
        }

        private static AutoCadConnectorElementRow BuildElementRow(Transaction transaction, Entity entity, string drawingName)
        {
            var blockReference = entity as BlockReference;
            var sourceId = entity.Handle.ToString();
            var dxfName = entity.GetRXClass()?.DxfName ?? entity.GetType().Name;
            var elementType = MapElementType(entity, blockReference, dxfName);
            var lengthFt = ReadLengthFeet(entity);
            var extents = ReadExtents(entity);
            var row = new AutoCadConnectorElementRow
            {
                Guid = sourceId,
                SourceId = sourceId,
                SourceFile = drawingName,
                ElementType = elementType,
                Tag = ReadTag(transaction, blockReference) ?? entity.Layer ?? sourceId,
                Name = blockReference?.Name ?? dxfName,
                Level = ReadXData(entity, "LEVEL") ?? string.Empty,
                Area = ReadXData(entity, "AREA") ?? string.Empty,
                System = ReadXData(entity, "SYSTEM") ?? entity.Layer ?? string.Empty,
                Dimensions = extents,
                LengthFt = lengthFt,
                Quantity = lengthFt > 0 ? Math.Round(lengthFt, 3) : 1,
                MappedProjectId = ReadXData(entity, "CTR_PROJECT_ID") ?? string.Empty,
            };
            row.SourceProperties["handle"] = sourceId;
            row.SourceProperties["objectId"] = entity.ObjectId.ToString();
            row.SourceProperties["dxfName"] = dxfName;
            row.SourceProperties["layer"] = entity.Layer ?? string.Empty;
            row.SourceProperties["blockName"] = blockReference?.Name ?? string.Empty;
            row.SourceProperties["color"] = entity.Color?.ColorNameForDisplay ?? string.Empty;
            row.PropertySets.Add($"CableTrayRoute.{row.ElementType}");
            if (string.IsNullOrWhiteSpace(row.Tag)) row.Warnings.Add("Missing tag/mark attribute; layer or handle was used.");
            if (row.ElementType == "generic") row.Warnings.Add("Generic AutoCAD entity mapping requires review.");
            return row;
        }

        private static string MapElementType(Entity entity, BlockReference blockReference, string dxfName)
        {
            var layer = entity.Layer ?? string.Empty;
            var blockName = blockReference?.Name ?? string.Empty;
            var text = $"{layer} {blockName} {dxfName}";
            if (ContainsAny(text, "tray", "cabletray")) return "cableTray";
            if (ContainsAny(text, "conduit", "duct")) return "conduit";
            if (ContainsAny(text, "equip", "mcc", "swbd", "switchboard", "panel")) return "equipment";
            if (ContainsAny(text, "support", "hanger", "strut")) return "support";
            return "generic";
        }

        private static bool ContainsAny(string value, params string[] tokens)
        {
            return tokens.Any(token => value.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0);
        }

        private static string ReadTag(Transaction transaction, BlockReference blockReference)
        {
            if (blockReference == null) return null;
            foreach (ObjectId attributeId in blockReference.AttributeCollection)
            {
                var attribute = transaction.GetObject(attributeId, OpenMode.ForRead, false) as AttributeReference;
                if (attribute == null) continue;
                var tag = attribute.Tag ?? string.Empty;
                if (ContainsAny(tag, "tag", "mark", "ctr_tag", "equipment_id"))
                {
                    return attribute.TextString;
                }
            }
            return blockReference.Name;
        }

        private static double ReadLengthFeet(Entity entity)
        {
            var curve = entity as Curve;
            if (curve == null) return 0;
            try
            {
                return Math.Round(curve.GetDistanceAtParameter(curve.EndParam) - curve.GetDistanceAtParameter(curve.StartParam), 3);
            }
            catch
            {
                return 0;
            }
        }

        private static string ReadExtents(Entity entity)
        {
            try
            {
                var extents = entity.GeometricExtents;
                var min = extents.MinPoint;
                var max = extents.MaxPoint;
                return $"min=({FormatPoint(min)});max=({FormatPoint(max)})";
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string FormatPoint(Point3d point)
        {
            return $"{point.X:0.###},{point.Y:0.###},{point.Z:0.###}";
        }

        private static string ReadXData(Entity entity, string key)
        {
            if (entity.XData == null) return null;
            foreach (TypedValue value in entity.XData)
            {
                var text = value.Value as string;
                if (string.IsNullOrWhiteSpace(text)) continue;
                var prefix = key + "=";
                if (text.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return text.Substring(prefix.Length);
            }
            return null;
        }

        public string BuildEnvelope(string connectorPayloadJson)
        {
            if (string.IsNullOrWhiteSpace(connectorPayloadJson))
            {
                throw new ArgumentException("Connector payload JSON is required.", nameof(connectorPayloadJson));
            }
            return connectorPayloadJson;
        }

        public void WritePackage(string path, string connectorPayloadJson)
        {
            if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Output path is required.", nameof(path));
            File.WriteAllText(path, BuildEnvelope(connectorPayloadJson), Encoding.UTF8);
        }

        public string ReadPackage(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Input path is required.", nameof(path));
            return File.ReadAllText(path, Encoding.UTF8);
        }

        public bool LooksLikeCableTrayRoutePackage(string connectorPayloadJson)
        {
            return ValidatePackage(connectorPayloadJson).IsValid;
        }

        public ValidationResult ValidatePackage(string connectorPayloadJson)
        {
            var result = new ValidationResult();
            if (string.IsNullOrWhiteSpace(connectorPayloadJson))
            {
                result.Errors.Add("Connector package JSON is empty.");
                return result;
            }
            if (!connectorPayloadJson.Contains(ConnectorContract.ContractVersion)) result.Errors.Add($"Missing contract version {ConnectorContract.ContractVersion}.");
            if (!connectorPayloadJson.Contains("\"connectorType\"")) result.Errors.Add("Missing connectorType.");
            if (!connectorPayloadJson.Contains("\"autocad\"")) result.Errors.Add("Package is not marked as connectorType autocad.");
            if (!connectorPayloadJson.Contains("\"elements\"")) result.Errors.Add("Missing elements array.");
            if (!connectorPayloadJson.Contains("\"sourceId\"") && !connectorPayloadJson.Contains("\"guid\"")) result.Warnings.Add("No sourceId or guid fields were found for stable AutoCAD round-trip mapping.");
            return result;
        }

        public string BuildPreviewReport(string connectorPayloadJson)
        {
            var validation = ValidatePackage(connectorPayloadJson);
            var builder = new StringBuilder();
            builder.AppendLine("CableTrayRoute AutoCAD Import Preview");
            builder.AppendLine($"Contract: {ConnectorContract.ContractVersion}");
            builder.AppendLine($"Valid: {validation.IsValid}");
            if (validation.Errors.Count > 0) builder.AppendLine("Errors: " + string.Join("; ", validation.Errors));
            if (validation.Warnings.Count > 0) builder.AppendLine("Warnings: " + string.Join("; ", validation.Warnings));
            builder.AppendLine("No AutoCAD drawing entities were created, modified, or deleted.");
            builder.AppendLine("Accept elements and issues in CableTrayRoute BIM Coordination after review.");
            return builder.ToString();
        }

        private static void AppendElementRow(StringBuilder builder, AutoCadConnectorElementRow row)
        {
            builder.Append("{");
            JsonProperty(builder, "guid", row.Guid, true);
            JsonProperty(builder, "sourceId", row.SourceId);
            JsonProperty(builder, "sourceFile", row.SourceFile);
            JsonProperty(builder, "elementType", row.ElementType);
            JsonProperty(builder, "tag", row.Tag);
            JsonProperty(builder, "name", row.Name);
            JsonProperty(builder, "level", row.Level);
            JsonProperty(builder, "area", row.Area);
            JsonProperty(builder, "system", row.System);
            JsonProperty(builder, "dimensions", row.Dimensions);
            JsonProperty(builder, "quantity", row.Quantity);
            JsonProperty(builder, "lengthFt", row.LengthFt);
            JsonProperty(builder, "mappedProjectId", row.MappedProjectId);
            builder.Append(",\"sourceProperties\":{");
            var index = 0;
            foreach (var pair in row.SourceProperties)
            {
                JsonProperty(builder, pair.Key, pair.Value, index == 0);
                index += 1;
            }
            builder.Append("},\"propertySets\":[");
            AppendStringArray(builder, row.PropertySets);
            builder.Append("],\"issues\":[");
            AppendStringArray(builder, row.Issues);
            builder.Append("],\"warnings\":[");
            AppendStringArray(builder, row.Warnings);
            builder.Append("]}");
        }

        private static void JsonProperty(StringBuilder builder, string name, string value, bool first = false)
        {
            if (!first) builder.Append(",");
            builder.Append("\"").Append(EscapeJson(name)).Append("\":\"").Append(EscapeJson(value ?? string.Empty)).Append("\"");
        }

        private static void JsonProperty(StringBuilder builder, string name, double value, bool first = false)
        {
            if (!first) builder.Append(",");
            builder.Append("\"").Append(EscapeJson(name)).Append("\":").Append(value.ToString("0.###", CultureInfo.InvariantCulture));
        }

        private static void AppendStringArray(StringBuilder builder, IEnumerable<string> values)
        {
            var index = 0;
            foreach (var value in values)
            {
                if (index > 0) builder.Append(",");
                builder.Append("\"").Append(EscapeJson(value ?? string.Empty)).Append("\"");
                index += 1;
            }
        }

        private static string EscapeJson(string value)
        {
            return (value ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", "\\r")
                .Replace("\n", "\\n");
        }
    }
}
