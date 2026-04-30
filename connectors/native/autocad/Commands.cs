using System;
using System.Diagnostics;
using System.IO;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;

namespace CableTrayRoute.AutoCADConnector
{
    internal static class ConnectorContract
    {
        public const string ContractVersion = "bim-connector-contract-v1";
        public const string ExportCommandName = "ExportCableTrayRouteJson";
        public const string ImportPreviewCommandName = "ImportCableTrayRoutePreview";
        public const string ValidateCommandName = "ValidateCableTrayRoutePackage";
        public const string OpenBridgeCommandName = "OpenCableTrayRouteBridge";
        public const string LocalBridgeUrl = "http://localhost:41731/cabletrayroute/autocad-bridge";
        public const string ExchangeFolderName = "CableTrayRoute\\AutoCadBridge";
    }

    internal static class CommandContext
    {
        public static Document ActiveDocument()
        {
            var document = Application.DocumentManager.MdiActiveDocument;
            if (document == null) throw new InvalidOperationException("No active AutoCAD document is available.");
            return document;
        }

        public static string EnsureExchangeFolder()
        {
            var root = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            var folder = Path.Combine(root, ConnectorContract.ExchangeFolderName);
            Directory.CreateDirectory(folder);
            return folder;
        }

        public static string PromptForJsonFile(Editor editor, string message, bool forSave)
        {
            if (forSave)
            {
                var options = new PromptSaveFileOptions(message) { Filter = "JSON package (*.json)|*.json|All files (*.*)|*.*" };
                var result = editor.GetFileNameForSave(options);
                return result.Status == PromptStatus.OK ? result.StringResult : string.Empty;
            }
            else
            {
                var options = new PromptOpenFileOptions(message) { Filter = "JSON package (*.json)|*.json|All files (*.*)|*.*" };
                var result = editor.GetFileNameForOpen(options);
                return result.Status == PromptStatus.OK ? result.StringResult : string.Empty;
            }
        }
    }

    public class ExportCableTrayRouteJsonCommand
    {
        [CommandMethod(ConnectorContract.ExportCommandName)]
        public void Execute()
        {
            var document = CommandContext.ActiveDocument();
            var editor = document.Editor;
            var service = new ConnectorJsonService();
            var defaultPath = Path.Combine(CommandContext.EnsureExchangeFolder(), $"{Path.GetFileNameWithoutExtension(document.Name)}-autocad-connector.json");
            var outputPath = CommandContext.PromptForJsonFile(editor, $"\nExport CableTrayRoute connector JSON <{defaultPath}>: ", true);
            if (string.IsNullOrWhiteSpace(outputPath)) outputPath = defaultPath;

            var payload = service.BuildConnectorJson(document.Database, document.Name);
            service.WritePackage(outputPath, payload);
            editor.WriteMessage($"\nCableTrayRoute connector JSON exported: {outputPath}");
        }
    }

    public class ValidateCableTrayRoutePackageCommand
    {
        [CommandMethod(ConnectorContract.ValidateCommandName)]
        public void Execute()
        {
            var document = CommandContext.ActiveDocument();
            var editor = document.Editor;
            var service = new ConnectorJsonService();
            var inputPath = CommandContext.PromptForJsonFile(editor, "\nSelect CableTrayRoute connector JSON to validate: ", false);
            if (string.IsNullOrWhiteSpace(inputPath)) return;

            var payload = service.ReadPackage(inputPath);
            var validation = service.ValidatePackage(payload);
            editor.WriteMessage(validation.IsValid
                ? $"\nCableTrayRoute package validates for {ConnectorContract.ContractVersion}."
                : $"\nCableTrayRoute package validation failed: {string.Join("; ", validation.Errors)}");
            if (validation.Warnings.Count > 0)
            {
                editor.WriteMessage($"\nWarnings: {string.Join("; ", validation.Warnings)}");
            }
        }
    }

    public class ImportCableTrayRoutePreviewCommand
    {
        [CommandMethod(ConnectorContract.ImportPreviewCommandName)]
        public void Execute()
        {
            var document = CommandContext.ActiveDocument();
            var editor = document.Editor;
            var service = new ConnectorJsonService();
            var inputPath = CommandContext.PromptForJsonFile(editor, "\nSelect CableTrayRoute return package for review-only preview: ", false);
            if (string.IsNullOrWhiteSpace(inputPath)) return;

            var payload = service.ReadPackage(inputPath);
            var preview = service.BuildPreviewReport(payload);
            var previewPath = Path.Combine(CommandContext.EnsureExchangeFolder(), $"{Path.GetFileNameWithoutExtension(inputPath)}-preview.txt");
            File.WriteAllText(previewPath, preview);
            editor.WriteMessage($"\nCableTrayRoute import preview written: {previewPath}");
            editor.WriteMessage("\nNo AutoCAD entities were created, modified, or deleted.");
        }
    }

    public class OpenCableTrayRouteBridgeCommand
    {
        [CommandMethod(ConnectorContract.OpenBridgeCommandName)]
        public void Execute()
        {
            var document = CommandContext.ActiveDocument();
            var editor = document.Editor;
            var folder = CommandContext.EnsureExchangeFolder();
            editor.WriteMessage($"\nCableTrayRoute bridge URL: {ConnectorContract.LocalBridgeUrl}");
            editor.WriteMessage($"\nCableTrayRoute exchange folder: {folder}");
            editor.WriteMessage("\nBridge operations are file/preview based in V1. Automatic CAD write-back is intentionally disabled.");
            try
            {
                Process.Start(new ProcessStartInfo(folder) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                editor.WriteMessage($"\nUnable to open exchange folder automatically: {ex.Message}");
            }
        }
    }
}
