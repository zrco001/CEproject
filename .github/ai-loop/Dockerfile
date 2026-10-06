# Only this trusted image can execute; application dependencies/scripts never run here.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
# The official pinned package's installer selects the Linux native binary.
RUN npm install --global @anthropic-ai/claude-code@2.1.292
RUN useradd --create-home --uid 1001 agent
USER agent
WORKDIR /repo
ENV CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
ENTRYPOINT ["claude", "--bare", "--print", "--tools", "Read,Edit,Write,Glob,Grep", "--allowedTools", "Read,Edit,Write,Glob,Grep", "--permission-mode", "acceptEdits", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--setting-sources", "", "--max-turns", "20", "--max-budget-usd", "5", "--no-session-persistence"]
