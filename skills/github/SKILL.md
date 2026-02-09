---
name: github
description: "Interact with GitHub using the `gh` CLI for PRs, issues and workflows."
metadata:
  openclaw:
    emoji: "🐙"
    requires:
      bins: ["gh"]
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub.

## Common Tasks

### Check Pull Request Status
```bash
gh pr checks <PR_NUMBER> --repo <OWNER>/<REPO>
```

### List Issues
```bash
gh issue list --limit 5
```
