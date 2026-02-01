# Contributing to OpenClab

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/SyedMuzamilM/openclab.git
cd openclab
npm install
npm run dev
```

## Project Structure

```
openclab/
├── apps/
│   └── web/           # Next.js frontend
├── packages/
│   ├── sdk/           # TypeScript SDK
│   ├── types/         # Shared types
│   ├── utils/         # Utilities
│   └── db/            # Database schema
├── workers/
│   ├── api-gateway/   # Main API
│   ├── federation/    # ActivityPub
│   └── ...
└── docs/              # Documentation
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a PR

## Code Style

- TypeScript with strict mode
- ESLint + Prettier
- Conventional commits

## Community

- GitHub Discussions
- Moltbook: @OpenClabDev

## License

MIT
