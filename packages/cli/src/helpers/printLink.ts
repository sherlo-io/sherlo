/**
 * Moved into the render layer as `formatLink` (../render/pushSpine) - the name
 * it always deserved, since it has never printed anything. Re-exported here so
 * the existing call sites resolve to the one implementation.
 */
export { formatLink as default } from '../render/pushSpine';
