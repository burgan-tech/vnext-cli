#load "ScriptGlobals.csx"

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using BBT.Workflow.Scripting;
using BBT.Workflow.Definitions;
using BBT.Workflow.Scripting.Functions;

/// <summary>
/// Template for creating new mapping classes
/// Replace [YourMappingName] with your actual mapping class name
/// </summary>
public class [YourMappingName]Mapping : ScriptBase, IMapping
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
        
        // Example: Prepare request data from workflow instance
        response.Data = new 
        {
            userId = context.Instance.UserId,
            workflowId = context.Instance.Id,
            // Add other required fields for your API call
            requestTime = DateTime.UtcNow
        };

        // Example: Set custom headers
        response.Headers = new Dictionary<string, string>
        {
            ["X-Correlation-Id"] = context.Instance.CorrelationId,
            ["X-User-Id"] = context.Instance.UserId
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
        
        // Access the standardized response format
        // context.Body now contains: IsSuccess, StatusCode, Data, ErrorMessage, Headers, Metadata, etc.
        
        // Example 1: Handle HTTP status codes
        if (context.Body.StatusCode != null)
        {
            var statusCode = (int)context.Body.StatusCode;
            
            if (statusCode == 200)
            {
                // Success - process the actual data
                response.Data = new 
                {
                    success = true,
                    result = context.Body.Data,
                    processedAt = DateTime.UtcNow
                };
            }
            else if (statusCode == 404)
            {
                // Not found - handle specifically
                response.Data = new 
                {
                    success = false,
                    error = "Resource not found",
                    shouldRetry = false
                };
            }
            else if (statusCode >= 500)
            {
                // Server error - might want to retry
                response.Data = new 
                {
                    success = false,
                    error = "Server error occurred",
                    shouldRetry = true,
                    retryAfter = 30 // seconds
                };
            }
            else if (statusCode >= 400)
            {
                // Client error - don't retry
                response.Data = new 
                {
                    success = false,
                    error = context.Body.ErrorMessage ?? "Client error occurred",
                    shouldRetry = false
                };
            }
        }
        
        // Example 2: Handle success/failure status
        else if (context.Body.IsSuccess != null)
        {
            if ((bool)context.Body.IsSuccess)
            {
                // Task succeeded
                response.Data = new 
                {
                    success = true,
                    result = context.Body.Data,
                    taskType = context.Body.TaskType,
                    executionTime = context.Body.ExecutionDurationMs
                };
            }
            else
            {
                // Task failed
                response.Data = new 
                {
                    success = false,
                    error = context.Body.ErrorMessage,
                    taskType = context.Body.TaskType,
                    executionTime = context.Body.ExecutionDurationMs,
                    shouldRetry = ShouldRetryBasedOnError(context.Body.ErrorMessage)
                };
            }
        }
        
        // Example 3: Access metadata for debugging or business logic
        if (context.Body.Metadata != null)
        {
            var metadata = context.Body.Metadata as Dictionary<string, object>;
            
            // Log important information
            Console.WriteLine($"Task Type: {context.Body.TaskType}");
            Console.WriteLine($"Execution Duration: {context.Body.ExecutionDurationMs}ms");
            
            if (metadata.ContainsKey("Url"))
            {
                Console.WriteLine($"Called URL: {metadata["Url"]}");
            }
            
            if (metadata.ContainsKey("Method"))
            {
                Console.WriteLine($"HTTP Method: {metadata["Method"]}");
            }
        }

        return response;
    }

    /// <summary>
    /// Helper method to determine if a task should be retried based on error message.
    /// </summary>
    /// <param name="errorMessage">The error message from the failed task</param>
    /// <returns>True if the task should be retried, false otherwise</returns>
    private bool ShouldRetryBasedOnError(string errorMessage)
    {
        if (string.IsNullOrEmpty(errorMessage))
            return false;
            
        var retryableErrors = new[]
        {
            "timeout",
            "connection",
            "network",
            "service unavailable",
            "internal server error"
        };
        
        return retryableErrors.Any(error => 
            errorMessage.ToLowerInvariant().Contains(error));
    }
} 