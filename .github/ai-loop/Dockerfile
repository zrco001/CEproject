# Only this trusted image can execute; application dependencies/scripts never run here.
FROM node:24-bookworm-slim
RUN npm install --global --ignore-scripts @anthropic-ai/claude-code@2.1.292
RUN useradd --create-home --uid 1001 agent
USER agent
WORKDIR /repo
ENV CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENTRYPOINT ["claude", "--bare", "--print", "--tools", "Read,Edit,Write,Glob,Grep", "--allowedTools", "Read,Edit,Write,Glob,Grep", "--permission-mode", "acceptEdits", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--setting-sources", "", "--max-turns", "20", "--max-budget-usd", "5", "--no-session-persistence"]
