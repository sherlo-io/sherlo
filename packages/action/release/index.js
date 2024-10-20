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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const cli_1 = require("@sherlo/cli");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const projectRoot = getOptionalInput('projectRoot');
            const config = getOptionalInput('config');
            const android = getOptionalInput('android');
            const ios = getOptionalInput('ios');
            const remoteExpo = getOptionalInput('remoteExpo');
            const remoteExpoBuildScript = getOptionalInput('remoteExpoBuildScript');
            const async = getOptionalInput('async');
            const asyncBuildIndex = getOptionalInput('asyncBuildIndex');
            const overrideCommitName = getOptionalInput('commitName');
            const { context } = github;
            let gitInfo = {
                commitHash: (context === null || context === void 0 ? void 0 : context.sha) || 'unknown',
                branchName: (context === null || context === void 0 ? void 0 : context.ref.split('refs/heads/')[1]) || 'unknown',
                commitName: 'unknown',
            };
            switch (context === null || context === void 0 ? void 0 : context.eventName) {
                case 'push':
                    const commitName = (_b = (_a = context === null || context === void 0 ? void 0 : context.payload) === null || _a === void 0 ? void 0 : _a.head_commit) === null || _b === void 0 ? void 0 : _b.message;
                    if (commitName) {
                        gitInfo = Object.assign(Object.assign({}, gitInfo), { commitName });
                    }
                    break;
                default:
                    console.log(JSON.stringify(context, null, 2));
                    break;
            }
            if (overrideCommitName) {
                gitInfo.commitName = overrideCommitName;
            }
            // TODO: odpalic localBuilds, lub expoRemoteBuilds, lub easBuildOnComplete
            const { buildIndex, url } = yield (0, cli_1.localBuilds)({
                projectRoot,
                config,
                token: emptyStringToUndefined(process.env.SHERLO_TOKEN), // Action returns an empty string if not defined
                android,
                ios,
                // remoteExpo: remoteExpo === 'true',
                // remoteExpoBuildScript,
                // async: async === 'true',
                // asyncBuildIndex: asyncBuildIndex ? Number(asyncBuildIndex) : undefined,
                gitInfo,
            });
            core.setOutput('buildIndex', buildIndex);
            core.setOutput('url', url);
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
        }
    });
}
function getOptionalInput(name) {
    const value = core.getInput(name, { required: false });
    return emptyStringToUndefined(value);
}
function emptyStringToUndefined(input) {
    return input === '' ? undefined : input;
}
run();
