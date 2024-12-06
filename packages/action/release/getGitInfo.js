"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGitInfo = getGitInfo;
const UNKNOWN_GIT_INFO_DEFAULT = 'unknown';
const github = __importStar(require("@actions/github"));
const child_process_1 = require("child_process");
const execCommand = (command) => {
    try {
        return (0, child_process_1.execSync)(command, { encoding: 'utf-8' }).trim();
    }
    catch (_a) {
        return UNKNOWN_GIT_INFO_DEFAULT; // Return default if command fails
    }
};
function getGitInfo(overrideCommitName) {
    var _a, _b, _c, _d;
    const { context } = github;
    // Try to get commit hash, branch name, and commit message using git
    const commitHash = execCommand('git rev-parse HEAD');
    const branchName = execCommand('git rev-parse --abbrev-ref HEAD');
    const commitName = overrideCommitName || execCommand('git log -1 --pretty=%B');
    // Fallback to context if git information is not available
    const fallbackCommitHash = context.sha || UNKNOWN_GIT_INFO_DEFAULT;
    let fallbackBranchName = UNKNOWN_GIT_INFO_DEFAULT;
    let fallbackCommitName = UNKNOWN_GIT_INFO_DEFAULT;
    // Check context for branch name and commit message
    switch (context.eventName) {
        case 'pull_request':
        case 'pull_request_target':
            fallbackBranchName = ((_a = context.payload.pull_request) === null || _a === void 0 ? void 0 : _a.head.ref) || UNKNOWN_GIT_INFO_DEFAULT;
            break;
        case 'release':
            fallbackBranchName = `Release-${((_b = context.payload.release) === null || _b === void 0 ? void 0 : _b.tag_name) || UNKNOWN_GIT_INFO_DEFAULT}`;
            break;
        case 'push':
            fallbackBranchName = context.ref
                ? context.ref.split('refs/heads/')[1]
                : UNKNOWN_GIT_INFO_DEFAULT;
            break;
        case 'workflow_dispatch':
        case 'schedule':
            fallbackBranchName = UNKNOWN_GIT_INFO_DEFAULT; // No branch info available
            break;
        default:
            fallbackBranchName = context.ref
                ? context.ref.split('refs/heads/')[1]
                : UNKNOWN_GIT_INFO_DEFAULT;
            break;
    }
    fallbackCommitName =
        ((_c = context.payload.head_commit) === null || _c === void 0 ? void 0 : _c.message) ||
            ((_d = context.payload.commit) === null || _d === void 0 ? void 0 : _d.message) ||
            UNKNOWN_GIT_INFO_DEFAULT;
    return {
        commitHash: commitHash !== UNKNOWN_GIT_INFO_DEFAULT ? commitHash : fallbackCommitHash,
        branchName: branchName !== UNKNOWN_GIT_INFO_DEFAULT ? branchName : fallbackBranchName,
        commitName: commitName !== UNKNOWN_GIT_INFO_DEFAULT ? commitName : fallbackCommitName,
    };
}
