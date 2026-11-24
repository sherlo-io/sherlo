/**
 * The files of React Native that reach native, as the native recording tests run them: each one's
 * path, which the transformer marks by, and a source of the test's own standing for it.
 */
export const TURBO_MODULE_REGISTRY =
  'node_modules/react-native/Libraries/TurboModule/TurboModuleRegistry.js';
export const NATIVE_MODULES = 'node_modules/react-native/Libraries/BatchedBridge/NativeModules.js';
export const CALLABLE_MODULES =
  'node_modules/react-native/Libraries/Core/registerCallableModule.js';
export const FABRIC_RENDERER =
  'node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js';
export const DEVICE_EVENT_EMITTER =
  'node_modules/react-native/Libraries/EventEmitter/RCTDeviceEventEmitter.js';

// React Native's lookup of native modules, as the bundle has it: it reads the lookup native code
// installed once, as it loads.
export const registrySource = [
  'var turboModuleProxy = global.__turboModuleProxy;',
  'module.exports = {',
  '  get: function (name) { return turboModuleProxy(name); },',
  '  getEnforcing: function (name) { return turboModuleProxy(name); },',
  '};',
].join('\n');

// React Native's table of native modules on a bridgeless app, which native code installs.
export const nativeModulesSource =
  'module.exports = { __esModule: true, default: global.nativeModuleProxy };';

// React Native's registration of the modules native code calls into; `registered` stands for the
// list native code keeps.
export const callableModulesSource = [
  'var registered = {};',
  'module.exports = {',
  '  __esModule: true,',
  '  registered: registered,',
  '  default: function (name, moduleOrFactory) {',
  "    registered[name] = typeof moduleOrFactory === 'function' ? moduleOrFactory : function () {",
  '      return moduleOrFactory;',
  '    };',
  '  },',
  '};',
].join('\n');

// The same registration as a compiler may lay an ES module's exports: its default export a getter
// that is not configurable, so nothing can assign it or define it anew.
export const callableModulesWithFixedDefaultSource = [
  'var registered = {};',
  'function registerCallableModule(name, moduleOrFactory) {',
  "  registered[name] = typeof moduleOrFactory === 'function' ? moduleOrFactory : function () {",
  '    return moduleOrFactory;',
  '  };',
  '}',
  "Object.defineProperty(module.exports, '__esModule', { value: true });",
  'module.exports.registered = registered;',
  "Object.defineProperty(module.exports, 'default', {",
  '  enumerable: true,',
  '  get: function () { return registerCallableModule; },',
  '});',
].join('\n');

// The lines of React Native's Fabric renderer the transformer looks for, around a renderer of the
// test's own: `commit` commits the tree as React does.
export const rendererSource = [
  'var _nativeFabricUIManage = global.nativeFabricUIManager,',
  '  completeRoot = _nativeFabricUIManage.completeRoot,',
  '  registerEventHandler = _nativeFabricUIManage.registerEventHandler;',
  'function dispatchEvent(target, topLevelType, nativeEvent) {',
  '  global.eventsReactRan.push(topLevelType);',
  '}',
  'registerEventHandler && registerEventHandler(dispatchEvent);',
  'module.exports = { commit: function () { completeRoot(1, []); } };',
].join('\n');

// React Native's emitter of device events, as the bundle has it: every event native sends to
// JavaScript goes out through its `emit`.
export const deviceEventEmitterSource = [
  'var listeners = {};',
  'var emitter = {',
  '  addListener: function (name, listener) {',
  '    (listeners[name] = listeners[name] || []).push(listener);',
  '    return { remove: function () {} };',
  '  },',
  '  emit: function (name, payload) {',
  '    (listeners[name] || []).forEach(function (listener) { listener(payload); });',
  '  },',
  '};',
  'module.exports = { __esModule: true, default: emitter };',
].join('\n');
