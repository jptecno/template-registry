import {
  analyzeRegistryPatch,
  evaluatePullRequest,
} from "./scripts/danger/pr-policies.mjs";
import { reportFindings } from "./scripts/danger/report-findings.mjs";

const pullRequest = danger.github.pr;
const files = [
  ...danger.git.created_files,
  ...danger.git.modified_files,
  ...danger.git.deleted_files,
];
const registryDiff = files.includes("registry.json")
  ? await danger.git.diffForFile("registry.json")
  : null;
const results = evaluatePullRequest({
  title: pullRequest.title,
  body: pullRequest.body,
  author: pullRequest.user.login,
  baseBranch: pullRequest.base.ref,
  headBranch: pullRequest.head.ref,
  files: [...new Set(files)],
  additions: pullRequest.additions,
  deletions: pullRequest.deletions,
  registryChanges: analyzeRegistryPatch(registryDiff?.patch),
});

reportFindings(results, { fail, warn });
