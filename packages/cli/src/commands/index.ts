/*
 * ADDING A COMMAND? Its NAME follows the convention recorded in the COMMANDS
 * block of ../constants: primary flows are verbs (`test`, `view`, `init`),
 * management operations on a Sherlo resource are noun-verb (`project create`).
 */
export { default as easBuildOnComplete } from './easBuildOnComplete';
export { default as fingerprint } from './fingerprint';
export { default as init } from './init';
export { default as projectCreate } from './projectCreate';
export { default as projectList } from './projectList';
export { default as showError } from './showError';
export { default as teamCreate } from './teamCreate';
export { default as teamList } from './teamList';
export { default as test } from './test';
export { default as testEasCloudBuild } from './testEasCloudBuild';
export { default as view } from './view';
