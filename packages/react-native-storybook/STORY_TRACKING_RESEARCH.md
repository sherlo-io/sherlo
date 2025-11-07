# React Native Storybook Story Tracking Research

## Key Findings

### 1. Channel API Doesn't Emit Story Change Events
- **Finding**: React Native Storybook's channel API does NOT emit events when stories change (unlike web Storybook)
- **Evidence**: We set up listeners for multiple event names (`setCurrentStory`, `CURRENT_STORY_WAS_SET`, etc.) but received zero events when switching stories
- **Implication**: We cannot rely on channel events to detect story changes

### 2. Storybook Uses AsyncStorage for Persistence
- **Finding**: React Native Storybook uses AsyncStorage to persist the selected story
- **Key**: `lastOpenedStory` (confirmed from logs)
- **Issue**: AsyncStorage is asynchronous, making it difficult to read synchronously when mocks are accessed

### 3. View Object Structure
- **Finding**: The `view` object (from `@storybook/react-native`) contains:
  - `_idToPrepared`: Map of all prepared stories (we use this in `prepareSnapshots.ts`)
  - `getStorybookUI(params)`: Function that returns the Storybook UI component
- **Unknown**: Where the current selection is stored in the view object
- **Next Step**: Need to inspect `global.view` object keys when story is selected to find the property

### 4. Preview API Limitations
- **Finding**: `__STORYBOOK_ADDONS_PREVIEW` exists and provides `getChannel()`, but:
  - No `getCurrentStory()` method
  - Channel doesn't emit story change events
- **Implication**: Preview API is not useful for tracking story changes

## Current Implementation Status

### What We've Tried:
1. ✅ Channel event listeners (doesn't work - no events emitted)
2. ✅ Preview API `getCurrentStory()` (doesn't exist)
3. ✅ Channel `lastEvent` property (doesn't exist)
4. ✅ Channel `data` property (only contains listener arrays)
5. ⏳ Polling `global.view` object (in progress - need to see what properties exist)

### What We Need:
1. **Inspect `global.view` object** when a story is selected to find which property contains the current story ID
2. **Determine if we can access Storybook UI component's internal state** via React refs or other means
3. **Consider AsyncStorage polling** as a last resort (but make it more efficient)

## Recommended Next Steps

### Step 1: Deep Inspection of View Object
When the app runs and you switch stories, we need to log ALL properties of `global.view` to see:
- What properties exist
- Which ones change when stories switch
- If any contain the current story ID

### Step 2: Wrap Storybook UI Component
Create a wrapper component that:
- Uses React refs to access the Storybook UI component's internal state
- Monitors component re-renders to detect story changes
- Checks if Storybook exposes any callbacks or props for story changes

### Step 3: AsyncStorage Polling (Fallback)
If the above don't work:
- Poll AsyncStorage's `lastOpenedStory` key efficiently
- Cache the value in a global object for synchronous access
- Update cache when polling detects changes

## Questions to Answer

1. **Does `global.view` have a property that contains the current story ID?**
   - Need to log all properties when story changes
   
2. **Can we access the Storybook UI component's internal state?**
   - React components' state is typically private
   - Might need to use React DevTools or other debugging tools
   
3. **Does Storybook expose any callbacks for story changes?**
   - Check `getStorybookUI` params for `onStoryChange` or similar
   - Check Storybook documentation for available callbacks

4. **Is there a way to hook into Storybook's internal selection mechanism?**
   - Maybe through addon API?
   - Maybe through the view object's internal methods?

## Current Code Locations

- **Addon registration**: `src/addons/sherlo-variant-tracker/register.ts`
- **Variant getter**: `src/getCurrentVariant.ts`
- **Storybook wrapper**: `src/getStorybook/getStorybook.tsx`
- **Component helper**: `src/getStorybook/helpers/getStorybookComponent.ts`

