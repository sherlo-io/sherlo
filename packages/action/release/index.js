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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const sherlo_1 = require("sherlo");
const getGitInfo_1 = require("./getGitInfo");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const command = core.getInput('command', { required: true });
            const overrideCommitName = getOptionalInput('commitName');
            const options = {
                android: getOptionalInput(sherlo_1.constants.ANDROID_OPTION),
                ios: getOptionalInput(sherlo_1.constants.IOS_OPTION),
                config: getOptionalInput(sherlo_1.constants.CONFIG_OPTION),
                projectRoot: getOptionalInput(sherlo_1.constants.PROJECT_ROOT_OPTION),
                token: emptyStringToUndefined(process.env.SHERLO_TOKEN),
            };
            let commandFunction;
            switch (command) {
                case sherlo_1.constants.LOCAL_BUILDS_COMMAND:
                    commandFunction = sherlo_1.commands.localBuilds;
                    break;
                case sherlo_1.constants.EXPO_UPDATE_COMMAND:
                    options.branch = getOptionalInput(sherlo_1.constants.BRANCH_OPTION);
                    commandFunction = sherlo_1.commands.expoUpdate;
                    break;
                case sherlo_1.constants.EXPO_CLOUD_BUILDS_COMMAND:
                    options.easBuildScriptName = getOptionalInput(sherlo_1.constants.EAS_BUILD_SCRIPT_NAME_OPTION);
                    options.waitForEasBuild = core.getBooleanInput(sherlo_1.constants.WAIT_FOR_EAS_BUILD_OPTION);
                    commandFunction = sherlo_1.commands.expoCloudBuilds;
                    break;
                default:
                    throw new Error(`Unsupported command: ${command}`);
            }
            options.gitInfo = (0, getGitInfo_1.getGitInfo)(overrideCommitName);
            // We cast options as any to leverage validation in Sherlo CLI
            const { url } = yield commandFunction(options);
            core.setOutput('url', url);
        }
        catch (error) {
            if (error instanceof Error)
                core.setFailed(error.message);
        }
    });
}
/******************************************************************************/
function getOptionalInput(name) {
    const value = core.getInput(name, { required: false });
    return emptyStringToUndefined(value);
}
function emptyStringToUndefined(input) {
    return input === '' ? undefined : input;
}
run();
