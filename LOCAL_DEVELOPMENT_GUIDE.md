# VoteSecure Local Development Guide

This guide explains how to work with VoteSecure in a local development environment, with or without Claude Code.

## Table of Contents
- [Initial Setup](#initial-setup)
- [Daily Development Workflow](#daily-development-workflow)
- [Working with Claude Code](#working-with-claude-code)
- [Git Workflow](#git-workflow)
- [Testing Changes](#testing-changes)
- [Troubleshooting](#troubleshooting)

---

## Initial Setup

### Prerequisites
- **Node.js** (v16 or higher recommended)
- **npm** (comes with Node.js)
- **Git** (for version control)
- A modern web browser (Chrome, Firefox, Edge, etc.)

### First-Time Setup

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/psawyerberlin/votesecure.git
   cd votesecure
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Verify installation**:
   ```bash
   npm run dev
   ```
   The dev server should start at http://localhost:8080

---

## Daily Development Workflow

### Starting Your Development Session

1. **Navigate to project directory**:
   ```bash
   cd C:\01_PSLaptopData\04_java\votesecure_v0.87
   ```

2. **Update from GitHub** (get latest changes):
   ```bash
   git pull origin main
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   Keep this running in a separate terminal window!

4. **Open in browser**:
   - Navigate to http://localhost:8080
   - Open DevTools (F12) for debugging

### Making Changes

1. Edit files in your preferred editor (VS Code, etc.)
2. Save your changes
3. Refresh browser to see updates (Ctrl+Shift+R for hard refresh)

---

## Working with Claude Code

### How Claude Code Integrates

Claude Code can:
- ✅ Edit your HTML, JavaScript, and CSS files directly
- ✅ Install npm packages when needed
- ✅ Run git commands (commit, push, status)
- ✅ Start/stop the dev server
- ✅ Help debug issues

### Session Start Hook

The `.claude/hooks/SessionStart` script runs automatically when Claude Code starts:
- Checks if `node_modules` exists
- Installs dependencies if needed
- Updates dependencies if `package.json` changed
- Displays helpful reminders

### Best Practices with Claude Code

**DO:**
- ✅ Keep `npm run dev` running in a separate terminal while Claude Code works
- ✅ Test changes in browser after Claude makes edits
- ✅ Review Claude's changes before committing
- ✅ Ask Claude to explain code changes if unclear

**DON'T:**
- ❌ Don't close the dev server while testing
- ❌ Don't edit files simultaneously with Claude (conflicts may occur)
- ❌ Don't skip testing after changes

### Typical Claude Code Workflow

1. **You ask Claude to make a change**:
   > "Add a loading spinner to the voting button"

2. **Claude edits the relevant files**:
   - Updates HTML, JS, or CSS
   - May install dependencies if needed

3. **You test the changes**:
   - Refresh browser (dev server still running)
   - Verify the new feature works

4. **Claude commits and pushes**:
   - Creates descriptive commit message
   - Pushes to feature branch for review

---

## Git Workflow

### Standard Git Commands

**Check status**:
```bash
git status
```

**Stage all changes**:
```bash
git add .
```

**Commit changes**:
```bash
git commit -m "Description of changes"
```

**Push to GitHub**:
```bash
git push origin main
```
*Note: Replace `main` with your current branch name if working on a feature branch*

**Check status again** (verify):
```bash
git status
```

### Working with Feature Branches

When Claude Code works, it uses feature branches:

**View current branch**:
```bash
git branch
```

**Switch branches**:
```bash
git checkout main
git checkout claude/feature-branch-name
```

**Merge feature branch to main**:
```bash
git checkout main
git merge claude/feature-branch-name
git push origin main
```

---

## Testing Changes

### Manual Testing Checklist

After making changes, test:

1. **Visual Check**:
   - Does the UI look correct?
   - Are there any console errors? (F12 → Console)

2. **Functionality Check**:
   - Does the new feature work as expected?
   - Did existing features break?

3. **Browser Compatibility**:
   - Test in Chrome/Edge
   - Test in Firefox (if critical)

4. **Responsive Design**:
   - Test on different screen sizes (F12 → Device toolbar)

### Testing Blockchain Integration

For CKB blockchain features:

1. **Check network connection**:
   - Verify CKB node is accessible
   - Check console for connection errors

2. **Test wallet integration**:
   - JoyID wallet connection
   - Transaction signing

3. **Verify smart contract calls**:
   - Monitor transaction status
   - Check blockchain explorer

---

## Troubleshooting

### Common Issues

**"Cannot find module" errors**:
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Dev server won't start**:
```bash
# Solution: Check if port 8080 is already in use
# On Windows PowerShell:
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process

# Then restart:
npm run dev
```

**Git conflicts**:
```bash
# Solution: Stash your changes, pull, then reapply
git stash
git pull origin main
git stash pop
# Resolve conflicts manually
```

**Browser cache issues**:
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear browser cache entirely

**Changes not appearing**:
1. Verify dev server is running
2. Check if you saved the file
3. Hard refresh browser (Ctrl+Shift+R)
4. Check browser console for errors

### Getting Help

- **Check console**: F12 → Console tab for JavaScript errors
- **Check network**: F12 → Network tab for failed requests
- **Ask Claude Code**: Describe the issue and share error messages
- **GitHub Issues**: https://github.com/psawyerberlin/votesecure/issues

---

## Project Structure

```
votesecure/
├── .claude/
│   └── hooks/
│       └── SessionStart       # Auto-setup script
├── documentation/
│   └── Votesecure_White_Paper.pdf
├── PythonSetup/
├── src/                       # JavaScript source files
├── web/                       # Additional web assets
├── index.html                 # Main application entry
├── package.json               # Dependencies and scripts
├── README.md                  # Project overview
└── LOCAL_DEVELOPMENT_GUIDE.md # This file
```

---

## Available NPM Scripts

- `npm start` - Start dev server and open browser automatically
- `npm run dev` - Start dev server (manual browser open)

---

## Additional Resources

- **VoteSecure White Paper**: `documentation/Votesecure_White_Paper.pdf`
- **Live Site**: https://votesecure.net
- **Repository**: https://github.com/psawyerberlin/votesecure
- **Nervos CKB Docs**: https://docs.nervos.org/
- **Lumos Framework**: https://github.com/ckb-js/lumos

---

## Quick Reference

### Start Working
```bash
cd C:\01_PSLaptopData\04_java\votesecure_v0.87
git pull origin main
npm run dev
# Open http://localhost:8080 in browser
```

### Save & Push Changes
```bash
git status
git add .
git commit -m "Description of changes"
git push origin main
git status
```

### Emergency Reset
```bash
# Discard all local changes (CAREFUL!)
git reset --hard HEAD
git clean -fd

# Or just discard uncommitted changes
git checkout .
```

---

**Last Updated**: November 7, 2025
**Version**: 1.0
**Maintainer**: VoteSecure Team
