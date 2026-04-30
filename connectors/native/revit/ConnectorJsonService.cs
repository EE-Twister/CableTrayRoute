using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace CableTrayRoute.RevitConnector
{
    public sealed class ConnectorValidationResult
    {
        public bool IsValid { get; set; }
        public int AcceptedRows { get; set; }
        public int RejectedRows { get; set; }
        public List<string> Messages { get; } = new List<string>();

        public string ToDisplayText()
        {
            var builder = new StringBuilder();
            builder.AppendLine(IsValid ? "Package passed local structural validation." : "Package needs review before handoff.");
            builder.AppendLine($"Accepted rows: {AcceptedRows}");
            builder.AppendLine($"Rejected rows: {RejectedRows}");
            foreach (var message in Messages.Take(12))
            {
                builder.AppendLine($"- {message}");
            }
            return builder.ToString();
        }
    }

    public sealed class ConnectorPreviewSummary
    {
        public bool IsValid { get; set; }
        public int AcceptedRows { get; set; }
        public int RejectedRows { get; set; }
        public int IssueRows { get; set; }
        public int UnmappedRows { get; set; }
        public List<string> Messages { get; } = new List<string>();

        public string ToDisplayText()
        {
            var builder = new StringBuilder();
            builder.AppendLine("CableTrayRoute return-package preview is review-only.");
            builder.AppendLine($"Accepted element rows: {AcceptedRows}");
            builder.AppendLine($"Rejected element rows: {RejectedRows}");
            builder.AppendLine($"Issue rows: {IssueRows}");
            builder.AppendLine($"Unmapped rows: {UnmappedRows}");
            foreach (var message in Messages.Take(12))
            {
                builder.AppendLine($"- {message}");
            }
            builder.AppendLine();
            builder.AppendLine("No Revit model elements were created, changed, or deleted.");
            return builder.ToString();
        }
    }

    public sealed class ConnectorJsonService
    {
        public string ContractVersion => ConnectorContract.ContractVersion;

        public string DefaultExchangeFolder()
        {
            var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            return Path.Combine(documents, "CableTrayRoute", "RevitBridge");
        }

        public string DefaultExportPath(string documentTitle)
        {
            Directory.CreateDirectory(DefaultExchangeFolder());
            var safeTitle = Regex.Replace(string.IsNullOrWhiteSpace(documentTitle) ? "RevitProject" : documentTitle, "[^A-Za-z0-9_.-]+", "_");
            return Path.Combine(DefaultExchangeFolder(), $"{safeTitle}.cabletrayroute.revit-export.json");
        }

        public string DefaultImportPath()
        {
            Directory.CreateDirectory(DefaultExchangeFolder());
            return Path.Combine(DefaultExchangeFolder(), "cabletrayroute.revit-return.json");
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
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("Output path is required.", nameof(path));
            }

            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }
            File.WriteAllText(path, BuildEnvelope(connectorPayloadJson), Encoding.UTF8);
        }

        public string ReadPackage(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("Input path is required.", nameof(path));
            }

            return File.ReadAllText(path, Encoding.UTF8);
        }

        public bool LooksLikeCableTrayRoutePackage(string connectorPayloadJson)
        {
            return !string.IsNullOrWhiteSpace(connectorPayloadJson)
                && connectorPayloadJson.Contains(ConnectorContract.ContractVersion)
                && connectorPayloadJson.Contains("\"connectorType\"")
                && connectorPayloadJson.Contains("\"revit\"");
        }

        public ConnectorValidationResult ValidatePackage(string connectorPayloadJson)
        {
            var result = new ConnectorValidationResult();
            if (string.IsNullOrWhiteSpace(connectorPayloadJson))
            {
                result.Messages.Add("Connector JSON is empty.");
                result.RejectedRows = 1;
                return result;
            }

            if (!connectorPayloadJson.Contains(ConnectorContract.ContractVersion))
            {
                result.Messages.Add($"Missing or unsupported contract version. Expected {ConnectorContract.ContractVersion}.");
            }

            if (!connectorPayloadJson.Contains("\"connectorType\"") || !connectorPayloadJson.Contains("\"revit\""))
            {
                result.Messages.Add("Package must identify connectorType \"revit\".");
            }

            if (!connectorPayloadJson.Contains("\"elements\""))
            {
                result.Messages.Add("Package must include an elements array.");
            }

            var elementCount = CountOccurrences(connectorPayloadJson, "\"elementType\"");
            var stableIds = CountOccurrences(connectorPayloadJson, "\"guid\"") + CountOccurrences(connectorPayloadJson, "\"sourceId\"");
            result.AcceptedRows = Math.Min(elementCount, stableIds);
            result.RejectedRows = Math.Max(0, elementCount - stableIds);
            if (elementCount == 0)
            {
                result.Messages.Add("No connector element rows were found.");
            }

            if (result.RejectedRows > 0)
            {
                result.Messages.Add("One or more element rows lack a stable guid/sourceId.");
            }

            result.IsValid = result.Messages.Count == 0 || result.Messages.All(message => message.StartsWith("One or more", StringComparison.OrdinalIgnoreCase));
            return result;
        }

        public ConnectorPreviewSummary BuildPreviewSummary(string connectorPayloadJson)
        {
            var validation = ValidatePackage(connectorPayloadJson);
            var preview = new ConnectorPreviewSummary
            {
                IsValid = validation.IsValid,
                AcceptedRows = validation.AcceptedRows,
                RejectedRows = validation.RejectedRows,
                IssueRows = CountOccurrences(connectorPayloadJson ?? string.Empty, "\"title\""),
                UnmappedRows = CountOccurrences(connectorPayloadJson ?? string.Empty, "\"mappedProjectId\":\"\""),
            };

            foreach (var message in validation.Messages)
            {
                preview.Messages.Add(message);
            }

            if (preview.UnmappedRows > 0)
            {
                preview.Messages.Add("Some rows are unmapped and should be reviewed in BIM Coordination before acceptance.");
            }

            if (connectorPayloadJson != null && connectorPayloadJson.IndexOf("automaticWriteBack", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                preview.Messages.Add("Automatic write-back metadata is ignored by this V1 review-only preview.");
            }

            return preview;
        }

        private static int CountOccurrences(string input, string token)
        {
            if (string.IsNullOrEmpty(input) || string.IsNullOrEmpty(token)) return 0;
            var count = 0;
            var index = 0;
            while ((index = input.IndexOf(token, index, StringComparison.OrdinalIgnoreCase)) >= 0)
            {
                count += 1;
                index += token.Length;
            }
            return count;
        }
    }
}
