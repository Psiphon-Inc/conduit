# Contributing to Conduit

Thank you for your interest in contributing to Conduit! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Contributor License Agreement](#contributor-license-agreement)
- [Areas for Contribution](#areas-for-contribution)
- [Getting Help](#getting-help)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/conduit.git
   cd conduit
   ```
3. **Add the upstream repository**:
   ```bash
   git remote add upstream https://github.com/Psiphon-Labs/conduit.git
   ```

## Development Setup

### Prerequisites

- **Node.js** (version 20 or as specified)
- **npm** or **yarn**
- **Git LFS** (for managing large binary files)
- **Android Studio** (for Android development)
- **Xcode** (for iOS/macOS development, macOS only)
- **CocoaPods** (for iOS development, macOS only)

### Initial Setup

1. **Install Git LFS** (if not already installed):
   ```bash
   git lfs install
   git lfs pull
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install iOS dependencies** (macOS only):
   ```bash
   cd ios
   pod install
   cd ..
   ```

4. **Verify setup**:
   ```bash
   npm run check
   ```

All checks should pass before you start contributing.

## Development Workflow

### 1. Create a Branch

Create a feature branch from `main`:

```bash
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `feature/add-new-component`
- `fix/bug-description`
- `docs/update-readme`

### 2. Make Changes

- Write clean, maintainable code
- Follow the code style guidelines (see below)
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

Before submitting, ensure all checks pass:

```bash
# Run all checks (tests, formatting, type checking)
npm run check

# Or run individually:
npm test              # Run tests
npm run format        # Format code
npm run tsc           # Type check
```

### 4. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add new component for settings"
```

Commit message format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### 5. Keep Your Branch Updated

Regularly sync with upstream:

```bash
git fetch upstream
git rebase upstream/main
```

## Code Style Guidelines

### TypeScript/JavaScript

- **Indentation**: 4 spaces (configured in Prettier)
- **Import Order**: 
  1. Third-party modules
  2. `@/src/*` imports (absolute imports)
  3. Relative imports (`./`, `../`)
- **Import Separation**: Groups separated by blank lines
- **Formatting**: Use Prettier (configured in `package.json`)

### Formatting Code

Before committing, format your code:

```bash
npm run format
```

This will:
- Convert relative imports to absolute imports where appropriate
- Format code with Prettier
- Sort imports according to project rules

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types; use proper types or `unknown`
- Enable strict type checking: `npm run tsc` must pass
- No unused locals or parameters

### React Native / Expo

- Use functional components with hooks
- Follow Expo Router conventions for routing
- Use TypeScript for component props
- Keep components focused and reusable

### File Naming

- Components: `PascalCase.tsx` (e.g., `ConduitStatus.tsx`)
- Utilities: `camelCase.ts` (e.g., `utils.ts`)
- Tests: `*.test.ts` or `*.test.tsx`

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (if supported)
npm test -- --watch
```

### Writing Tests

- Write tests for new features and bug fixes
- Use Jest (configured with `jest-expo`)
- Test files should be co-located with source files or in `__tests__` directories
- Aim for good test coverage

### Test Requirements

All tests must pass before submitting a PR. The CI will run:
- Jest test suite
- TypeScript type checking
- Prettier formatting checks

## Pull Request Process

### Before Submitting

1. **Ensure all checks pass**:
   ```bash
   npm run check
   ```

2. **Update documentation** if needed:
   - README.md for user-facing changes
   - Code comments for complex logic
   - Type definitions for new APIs

3. **Test on multiple platforms** if possible:
   - iOS (simulator or device)
   - Android (emulator or device)
   - macOS (if applicable)

### Submitting a Pull Request

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Provide a detailed description of changes
   - Reference any related issues
   - Include screenshots for UI changes

3. **PR Description Template**:
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Documentation update
   - [ ] Refactoring
   - [ ] Other (please describe)

   ## Testing
   - [ ] Tests pass locally
   - [ ] Tested on iOS
   - [ ] Tested on Android
   - [ ] All checks pass (`npm run check`)

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-review completed
   - [ ] Comments added for complex code
   - [ ] Documentation updated
   - [ ] No new warnings generated
   - [ ] CLA signed (first-time contributors)
   ```

### Code Review

- Be responsive to review feedback
- Address all comments before requesting re-review
- Keep PRs focused and reasonably sized
- Squash commits if requested during review

## Contributor License Agreement

### First-Time Contributors

When submitting your first pull request, you must agree to the Contributor License Agreement (CLA).

**For Individual Contributors:**

1. Read the [Individual CLA](./CLA-individual.md)
2. Create a file in the `contributors/` directory named `{your-github-username}.md`
3. Include your agreement statement in that file

**Example** (see [contributors/tmgrask.md](./contributors/tmgrask.md)):

```markdown
2026-01-25

I hereby agree to the terms of the "Psiphon Individual Contributor License Agreement", with MD5 checksum 61565d56a5c2d24c088b8eb5b35ec24b.

I furthermore declare that I am authorized and able to make this agreement and sign this declaration.

Signed,
Your Name (https://github.com/your-username)
```

Include this file in your first PR. Without it, your PR cannot be merged.

## Areas for Contribution

We welcome contributions in many areas:

### Code Contributions

- **Bug Fixes**: Fix issues reported in GitHub Issues
- **New Features**: Implement features from the roadmap
- **Performance**: Optimize app performance
- **Accessibility**: Improve app accessibility
- **Internationalization**: Help with translations (see [i18n/README.md](./i18n/README.md))

### Documentation

- **README Updates**: Improve setup instructions
- **Code Comments**: Add helpful comments
- **API Documentation**: Document functions and components
- **Tutorials**: Write guides for common tasks

### Testing

- **Test Coverage**: Add tests for untested code
- **Test Improvements**: Improve existing tests
- **E2E Tests**: Add end-to-end tests

### Design

- **UI/UX Improvements**: Enhance user interface
- **Accessibility**: Improve accessibility features
- **Localization**: Help with UI translations

## Getting Help

### Questions?

- **GitHub Issues**: For bug reports and feature requests
- **Pull Requests**: For code-related questions
- **Email**: Contact Psiphon at info@psiphon.ca

### Resources

- [README.md](./README.md) - Project overview and setup
- [i18n/README.md](./i18n/README.md) - Translation workflow
- [cli/README.md](./cli/README.md) - CLI documentation
- [Expo Documentation](https://docs.expo.dev/) - Expo/React Native docs

### Reporting Bugs

When reporting bugs, please include:

1. **Description**: Clear description of the bug
2. **Steps to Reproduce**: Detailed steps to reproduce
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**:
   - OS version
   - Device/emulator
   - App version
   - React Native/Expo version
6. **Screenshots**: If applicable
7. **Logs**: Relevant error messages or logs

## Development Tips

### Running the Dev Server

```bash
npm run dev-server
```

See [DEV-SERVER-GUIDE.md](./DEV-SERVER-GUIDE.md) for detailed instructions.

### Monitoring

Use the monitoring scripts:

```bash
./scripts/monitor-dev-server.sh    # Check server status
./scripts/test-dev-server.sh        # Test server functionality
```

### Debugging

- Use React Native Debugger
- Check Metro bundler logs
- Use `console.log` (remove before committing)
- Check TypeScript errors: `npm run tsc`

### Common Issues

**Port 8081 already in use:**
```bash
pkill -f "expo start"
```

**Git LFS issues:**
```bash
git lfs install
git lfs pull
```

**iOS build issues:**
```bash
cd ios
pod install
cd ..
```

**Type errors:**
```bash
npm run tsc  # Check for type errors
```

## Thank You!

Your contributions make Conduit better for everyone. We appreciate your time and effort!

If you have questions or need clarification on any of these guidelines, please don't hesitate to ask.
