/**
 * Moved into the render layer (../../render/pushSpine), because the count is a
 * rendering decision and nothing outside the run header ever needed it.
 * Re-exported here so an import of the old path still resolves to the one
 * implementation rather than growing a second copy.
 */
export { countDevicesByPlatform as default } from '../../render/pushSpine';
