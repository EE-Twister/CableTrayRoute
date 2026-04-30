using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace CableTrayRoute.RevitConnector
{
    internal static class ConnectorContract
    {
        public const string ContractVersion = "bim-connector-contract-v1";
        public const string ExportCommandName = "ExportCableTrayRouteJson";
        public const string ImportPreviewCommandName = "ImportCableTrayRoutePreview";
        public const string ValidateCommandName = "ValidateCableTrayRoutePackage";
        public const string OpenBridgeCommandName = "OpenCableTrayRouteBridge";
        public const string LocalBridgeUrl = "http://localhost:41731/cabletrayroute/revit-bridge";
    }

    internal sealed class RevitConnectorElementRow
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

    internal static class RevitElementExporter
    {
        private static readonly BuiltInCategory[] ExportCategories =
        {
            BuiltInCategory.OST_CableTray,
            BuiltInCategory.OST_Conduit,
            BuiltInCategory.OST_ElectricalEquipment,
            BuiltInCategory.OST_GenericModel,
        };

        public static string BuildConnectorJson(Document document)
        {
            if (document == null) throw new ArgumentNullException(nameof(document));
            var rows = CollectConnectorRows(document).ToList();
            var now = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            var builder = new StringBuilder();
            builder.Append("{");
            JsonProperty(builder, "version", ConnectorContract.ContractVersion, true);
            JsonProperty(builder, "connectorType", "revit");
            JsonProperty(builder, "sourceApplication", "Autodesk Revit CableTrayRoute Add-In");
            JsonProperty(builder, "sourceVersion", document.Application.VersionNumber ?? string.Empty);
            JsonProperty(builder, "projectId", document.Title ?? "Revit Project");
            JsonProperty(builder, "scenario", "Revit Export");
            JsonProperty(builder, "createdAt", now);
            builder.Append(",\"elements\":[");
            for (var index = 0; index < rows.Count; index += 1)
            {
                if (index > 0) builder.Append(",");
                AppendElementRow(builder, rows[index]);
            }
            builder.Append("],\"quantities\":[],\"issues\":[],\"propertySets\":[],\"mappingHints\":[],");
            builder.Append("\"warnings\":[\"Review-only Revit export. Validate and preview in CableTrayRoute before accepting BIM coordination records.\"],");
            builder.Append("\"assumptions\":[\"Exported from SDK-ready local Revit add-in source; no Revit model mutation is performed.\"]");
            builder.Append("}");
            return builder.ToString();
        }

        private static IEnumerable<RevitConnectorElementRow> CollectConnectorRows(Document document)
        {
            foreach (var category in ExportCategories)
            {
                var collector = new FilteredElementCollector(document)
                    .WhereElementIsNotElementType()
                    .OfCategory(category);
                foreach (var element in collector)
                {
                    if (element == null) continue;
                    yield return BuildElementRow(document, element, category);
                }
            }
        }

        private static RevitConnectorElementRow BuildElementRow(Document document, Element element, BuiltInCategory category)
        {
            var typeElement = document.GetElement(element.GetTypeId());
            var row = new RevitConnectorElementRow
            {
                Guid = element.UniqueId ?? string.Empty,
                SourceId = element.Id.IntegerValue.ToString(CultureInfo.InvariantCulture),
                SourceFile = document.PathName ?? document.Title ?? string.Empty,
                ElementType = MapElementType(category, element),
                Tag = ReadString(element, "Mark") ?? ReadString(element, "Tag") ?? element.Name ?? string.Empty,
                Name = element.Name ?? string.Empty,
                Level = ReadLevelName(document, element),
                Area = ReadString(element, "Area") ?? string.Empty,
                System = ReadString(element, "System Name") ?? ReadString(element, "System Type") ?? string.Empty,
                Dimensions = BuildDimensionText(element, typeElement),
                LengthFt = ReadLengthFeet(element),
                Quantity = 1,
                MappedProjectId = ReadString(element, "CableTrayRoute Project Id") ?? string.Empty,
            };
            if (row.LengthFt > 0) row.Quantity = Math.Round(row.LengthFt, 3);
            row.SourceProperties["category"] = category.ToString();
            row.SourceProperties["categoryName"] = element.Category?.Name ?? string.Empty;
            row.SourceProperties["familyName"] = ReadFamilyName(typeElement);
            row.SourceProperties["typeName"] = typeElement?.Name ?? string.Empty;
            row.SourceProperties["elementId"] = row.SourceId;
            row.PropertySets.Add($"CableTrayRoute.{row.ElementType}");
            if (string.IsNullOrWhiteSpace(row.Tag)) row.Warnings.Add("Missing Mark/Tag parameter.");
            if (row.ElementType == "generic") row.Warnings.Add("Generic Revit element mapping requires review.");
            return row;
        }

        private static string MapElementType(BuiltInCategory category, Element element)
        {
            if (category == BuiltInCategory.OST_CableTray) return "cableTray";
            if (category == BuiltInCategory.OST_Conduit) return "conduit";
            if (category == BuiltInCategory.OST_ElectricalEquipment) return "equipment";
            var family = ReadFamilyName(element.Document.GetElement(element.GetTypeId()));
            return family.IndexOf("support", StringComparison.OrdinalIgnoreCase) >= 0 ? "support" : "generic";
        }

        private static string ReadString(Element element, string parameterName)
        {
            var parameter = element?.LookupParameter(parameterName);
            if (parameter == null || !parameter.HasValue) return null;
            if (parameter.StorageType == StorageType.String) return parameter.AsString();
            if (parameter.StorageType == StorageType.Integer) return parameter.AsInteger().ToString(CultureInfo.InvariantCulture);
            if (parameter.StorageType == StorageType.Double) return parameter.AsDouble().ToString("0.###", CultureInfo.InvariantCulture);
            return parameter.AsValueString();
        }

        private static double ReadLengthFeet(Element element)
        {
            var locationCurve = element.Location as LocationCurve;
            if (locationCurve?.Curve != null) return Math.Round(locationCurve.Curve.Length, 3);
            var length = element.LookupParameter("Length");
            if (length != null && length.HasValue && length.StorageType == StorageType.Double)
            {
                return Math.Round(length.AsDouble(), 3);
            }
            return 0;
        }

        private static string ReadLevelName(Document document, Element element)
        {
            if (element.LevelId != ElementId.InvalidElementId)
            {
                var level = document.GetElement(element.LevelId) as Level;
                if (level != null) return level.Name;
            }
            return ReadString(element, "Reference Level") ?? string.Empty;
        }

        private static string ReadFamilyName(Element typeElement)
        {
            var familySymbol = typeElement as FamilySymbol;
            if (familySymbol?.Family != null) return familySymbol.Family.Name;
            return typeElement?.LookupParameter("Family Name")?.AsString() ?? string.Empty;
        }

        private static string BuildDimensionText(Element element, Element typeElement)
        {
            var width = ReadString(element, "Width") ?? ReadString(typeElement, "Width");
            var height = ReadString(element, "Height") ?? ReadString(typeElement, "Height");
            var diameter = ReadString(element, "Diameter") ?? ReadString(typeElement, "Diameter");
            if (!string.IsNullOrWhiteSpace(diameter)) return $"diameter={diameter}";
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(width)) parts.Add($"width={width}");
            if (!string.IsNullOrWhiteSpace(height)) parts.Add($"height={height}");
            return string.Join(";", parts);
        }

        private static void AppendElementRow(StringBuilder builder, RevitConnectorElementRow row)
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

        private static void JsonProperty(StringBuilder builder, string name, double value)
        {
            builder.Append(",\"").Append(EscapeJson(name)).Append("\":").Append(value.ToString("0.###", CultureInfo.InvariantCulture));
        }

        private static void AppendStringArray(StringBuilder builder, IEnumerable<string> values)
        {
            var index = 0;
            foreach (var value in values ?? Enumerable.Empty<string>())
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

    [Transaction(TransactionMode.Manual)]
    public class ExportCableTrayRouteJsonCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var document = commandData.Application.ActiveUIDocument?.Document;
            if (document == null)
            {
                message = "No active Revit document is available.";
                return Result.Failed;
            }

            var service = new ConnectorJsonService();
            var outputPath = service.DefaultExportPath(document.Title);
            var json = RevitElementExporter.BuildConnectorJson(document);
            service.WritePackage(outputPath, json);
            TaskDialog.Show("CableTrayRoute", $"Exported CableTrayRoute connector JSON:\n{outputPath}\n\nOpen BIM Coordination to validate and preview the package.");
            return Result.Succeeded;
        }
    }

    [Transaction(TransactionMode.Manual)]
    public class ImportCableTrayRoutePreviewCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var service = new ConnectorJsonService();
            var inputPath = service.DefaultImportPath();
            if (!File.Exists(inputPath))
            {
                TaskDialog.Show("CableTrayRoute", $"No return package found at:\n{inputPath}\n\nExport or download a Revit connector return JSON package from BIM Coordination first.");
                return Result.Cancelled;
            }

            var json = service.ReadPackage(inputPath);
            var preview = service.BuildPreviewSummary(json);
            TaskDialog.Show("CableTrayRoute Import Preview", preview.ToDisplayText());
            return preview.IsValid ? Result.Succeeded : Result.Failed;
        }
    }

    [Transaction(TransactionMode.Manual)]
    public class ValidateCableTrayRoutePackageCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var service = new ConnectorJsonService();
            var inputPath = service.DefaultImportPath();
            if (!File.Exists(inputPath))
            {
                TaskDialog.Show("CableTrayRoute", $"No connector package found at:\n{inputPath}");
                return Result.Cancelled;
            }

            var json = service.ReadPackage(inputPath);
            var validation = service.ValidatePackage(json);
            TaskDialog.Show("CableTrayRoute Package Validation", validation.ToDisplayText());
            return validation.IsValid ? Result.Succeeded : Result.Failed;
        }
    }

    [Transaction(TransactionMode.Manual)]
    public class OpenCableTrayRouteBridgeCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var service = new ConnectorJsonService();
            Directory.CreateDirectory(service.DefaultExchangeFolder());
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = ConnectorContract.LocalBridgeUrl,
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                TaskDialog.Show("CableTrayRoute Bridge", $"Bridge URL:\n{ConnectorContract.LocalBridgeUrl}\n\nExchange folder:\n{service.DefaultExchangeFolder()}\n\nCould not open browser automatically: {ex.Message}");
                return Result.Succeeded;
            }

            TaskDialog.Show("CableTrayRoute Bridge", $"Bridge URL:\n{ConnectorContract.LocalBridgeUrl}\n\nExchange folder:\n{service.DefaultExchangeFolder()}\n\nImports remain preview-only; accept BIM elements/issues in CableTrayRoute explicitly.");
            return Result.Succeeded;
        }
    }
}
