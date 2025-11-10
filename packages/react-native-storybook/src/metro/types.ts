/**
 * Story mock map: storyId -> packageName -> mockObject
 * Example: { "TestInfo--Basic": { "expo-localization": { getLocales: ... } } }
 */
export type StoryMockMap = Map<string, Map<string, any>>;

