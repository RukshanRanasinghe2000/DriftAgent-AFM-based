---
spec_version: "0.3.0"
name: "OpenAPI Drift Checker"
description: "Detect mismatch between API code and OpenAPI spec"
max_iterations: 20

model:
  name: "llama-3.3-70b-versatile"
  provider: "openai"
  base_url: "https://api.groq.com/openai/v1"
  authentication:
    type: "api-key"
    api_key: "${env:GROQ_API_KEY}"

interfaces:
  - type: "webhook"
    prompt: >
      Analyze PR ${http:payload.pull_request.url}
      Action: ${http:payload.action}

tools:
  mcp:
    - name: "github"
      transport:
        type: "http"
        url: "https://api.githubcopilot.com/mcp/"
        authentication:
          type: "bearer"
          token: "${env:GITHUB_TOKEN}"
      tool_filter:
        allow:
          - "pull_request_read"
          - "get_file_contents"
          - "pull_request_review_write"
---

# Role

You detect drift between API implementation and OpenAPI specification.

# Instructions

## 1. Get PR data
- Read PR changes and identify modified API routes

## 2. Find OpenAPI spec
- Search for files like `openapi.json`, `swagger.yaml`

## 3. Compare
- Check if all endpoints in code exist in spec
- Check method mismatches (GET/POST/etc.)
- Check missing parameters or schemas

## 4. Report
- If mismatch found → explain clearly
- If no issues → say "No API drift detected"