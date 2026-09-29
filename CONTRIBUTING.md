# Contributing to VoiceLab MCP Server

Thank you for considering contributing to the VoiceLab MCP server!

## Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/voicelab/voicelab-mcp.git
   cd voicelab-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run smoke tests:
   ```bash
   npm test
   ```

## Project Structure

```
src/
├── index.ts          # Main MCP server and tool registration
├── client.ts         # HTTP client with error handling
├── llm.ts            # LLM module (models, completions, status)
├── tts.ts            # Text-to-Speech module
├── stt.ts            # Speech-to-Text module
├── voices.ts         # Voices listing
├── isolator.ts       # Voice Isolator module
└── realtime.ts       # Realtime ticket generation
```

## Adding a New Tool

1. Add the API method to the appropriate module (e.g., `llm.ts`)
2. Define the tool schema in `src/index.ts` tools array
3. Add the tool handler in the CallToolRequestSchema handler
4. Update README.md with the new tool
5. Test locally with a VoiceLab API key

Example:

```typescript
// In src/tts.ts
async newMethod(param: string): Promise<Result> {
  return this.client.request<Result>('GET', `/v1/new-endpoint?param=${param}`);
}

// In src/index.ts tools array
{
  name: 'new_tool',
  description: 'Does something useful',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: 'Parameter description' },
    },
    required: ['param'],
  },
}

// In CallToolRequestSchema handler
case 'new_tool': {
  const result = await tts.newMethod(toolArgs.param as string);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

## Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep modules focused on single responsibilities

## Testing

Before submitting a PR:

1. Ensure the build passes: `npm run build`
2. Run smoke tests: `npm test`
3. Test manually with a real API key if touching core logic
4. Verify your changes work in Cursor

## API Coverage Principle

This server aims to cover **all** developer API-key endpoints from https://docs.voicelab.uz. Do not invent endpoints. If a documented endpoint is missing, adding it is a valuable contribution.

**Out of scope:**
- JWT-authenticated dashboard routes
- Account management APIs (except API key CRUD if documented for developers)
- Meeting AI / voice-agent internal routes

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Commit with a clear message describing what and why
4. Push to your fork
5. Open a PR against `main` with:
   - Clear title
   - Description of changes
   - Any relevant issue references
   - Test results

## Documentation

When adding features:
- Update README.md with new tools
- Add examples if the usage is non-obvious
- Update EXAMPLE_CONFIG.md if new environment variables are needed

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open an issue for bugs or feature requests
- Reach out to support@voicelab.uz for API questions
- Check https://docs.voicelab.uz for API documentation

Thank you for contributing! 🎉
