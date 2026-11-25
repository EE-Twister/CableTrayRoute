// Registers the home page's workflow diagnostics with the shell. The builder
// runs the design rule checker, deliverable readiness, and validation, so it is
// bundled with the home page entry instead of every page through site.js.
// site.js only uses it when the page body has the home-page class.
import { registerHomepageWorkflowDiagnostics } from "../site.js";
import { buildWorkflowCoreDiagnostics } from "../analysis/projectWorkflowCore.mjs";

registerHomepageWorkflowDiagnostics(buildWorkflowCoreDiagnostics);
