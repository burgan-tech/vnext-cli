#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Creates workflow CSX files from templates with automatic class naming
 * Usage: node create-workflow-file.js <type> <fileName>
 * Types: mapping, rule, script
 */

function toPascalCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => word.toUpperCase())
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

function getCurrentWorkingDirectory() {
  // Try to find the current working directory from VS Code context
  if (process.env.VSCODE_CWD) {
    return process.env.VSCODE_CWD;
  }

  // VSCode task sets this as working directory
  return process.cwd();
}

function getRelativeLoadPath(targetDir) {
  // Calculate relative path to ScriptGlobals.csx from target directory
  const workspaceRoot = path.resolve(__dirname, "../..");
  const templateDir = path.join(workspaceRoot, ".vscode/examples/template/src");
  const relativePath = path.relative(targetDir, templateDir);
  return path.join(relativePath, "ScriptGlobals.csx").replace(/\\/g, "/");
}

const templates = {
  mapping: (className, loadPath) => `#load "${loadPath}"

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using BBT.Workflow.Scripting;
using BBT.Workflow.Definitions;
using BBT.Workflow.Scripting.Functions;

/// <summary>
/// ${className} mapping for workflow task processing
/// </summary>
public class ${className} : ScriptBase, IMapping
{
    /// <summary>
    /// Handles input processing for the workflow task
    /// </summary>
    /// <param name="task">The workflow task being executed</param>
    /// <param name="context">Script context containing workflow data</param>
    /// <returns>Script response with processed input data</returns>
    public async Task<ScriptResponse> InputHandler(WorkflowTask task, ScriptContext context)
    {
        var response = new ScriptResponse();
        
        // TODO: Implement input processing logic
        response.Data = new 
        {
            // Add your input data here
            
        };

        // TODO: Set custom headers if needed
        response.Headers = new Dictionary<string, string>
        {
            // Add custom headers here
        };

        return response;
    }

    /// <summary>
    /// Handles output processing for the workflow task
    /// </summary>
    /// <param name="context">Script context containing workflow data and results</param>
    /// <returns>Script response with processed output data</returns>
    public async Task<ScriptResponse> OutputHandler(ScriptContext context)
    {
        var response = new ScriptResponse();
        
        // TODO: Process the response based on context.Body
        if (context.Body.StatusCode != null)
        {
            var statusCode = (int)context.Body.StatusCode;
            
            if (statusCode == 200)
            {
                // Success
                response.Data = new 
                {
                    success = true,
                    result = context.Body.Data,
                    processedAt = DateTime.UtcNow
                };
            }
            else
            {
                // Error handling
                response.Data = new 
                {
                    success = false,
                    error = context.Body.ErrorMessage ?? "Unknown error",
                    statusCode = statusCode
                };
            }
        }

        return response;
    }
}`,

  rule: (className, loadPath) => `#load "${loadPath}"

using System.Threading.Tasks;
using BBT.Workflow.Scripting;

/// <summary>
/// ${className} rule for workflow condition evaluation
/// </summary>
public class ${className} : IConditionMapping
{
    /// <summary>
    /// Evaluates the condition for workflow transition
    /// </summary>
    /// <param name="context">Script context containing workflow data</param>
    /// <returns>True if condition is met, false otherwise</returns>
    public async Task<bool> Handler(ScriptContext context)
    {
        // TODO: Implement your condition logic here
        
        
        return false; // Change this to your actual condition
    }
}`,

  script: (className, loadPath) => `#load "${loadPath}"

using System.Threading.Tasks;
using BBT.Workflow.Scripting;
using BBT.Workflow.Scripting.Functions;

/// <summary>
/// ${className} script for workflow processing
/// </summary>
public class ${className} : ScriptBase
{
    /// <summary>
    /// Main execution method
    /// </summary>
    /// <param name="context">Script context containing workflow data</param>
    /// <returns>Processing result</returns>
    public async Task<object> Execute(ScriptContext context)
    {
        // TODO: Implement your script logic here
        
        
        return new { success = true };
    }
}`,
};

// Main execution
const [, , type, fileName] = process.argv;

if (!type || !fileName) {
  console.error("Usage: node create-workflow-file.js <type> <fileName>");
  console.error("Types: mapping, rule, script");
  process.exit(1);
}

if (!templates[type]) {
  console.error(`Unknown template type: ${type}`);
  console.error("Available types: mapping, rule, script");
  process.exit(1);
}

console.log("🔄 Workflow File Creator");
console.log("=".repeat(50));

// Get current working directory
const currentDir = getCurrentWorkingDirectory();
console.log(`Working directory: ${currentDir}`);

// Generate class name
const className = toPascalCase(fileName);
console.log(`Class name: ${className}`);

// Generate file name
const fullFileName = fileName.endsWith(".csx") ? fileName : `${fileName}.csx`;
const targetFilePath = path.join(currentDir, fullFileName);

// Check if file already exists
if (fs.existsSync(targetFilePath)) {
  console.error(`❌ File already exists: ${fullFileName}`);
  process.exit(1);
}

// Calculate relative path to ScriptGlobals.csx
const loadPath = getRelativeLoadPath(currentDir);
console.log(`Load path: ${loadPath}`);

// Generate content
const content = templates[type](className, loadPath);

// Write file
try {
  fs.writeFileSync(targetFilePath, content, "utf-8");
  console.log(`✅ Successfully created: ${fullFileName}`);
  console.log(`📁 Location: ${targetFilePath}`);
  console.log(`🎯 Template type: ${type}`);
  console.log(`📝 Class name: ${className}`);

  // Additional guidance
  console.log("\n📋 Next steps:");
  console.log("1. Open the file in VS Code");
  console.log("2. Implement your logic in the TODO sections");
  console.log("3. Save and use Ctrl+Shift+W to update workflow JSON");
} catch (error) {
  console.error(`❌ Error creating file: ${error.message}`);
  process.exit(1);
}
