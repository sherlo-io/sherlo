/**
 * Wrapper component that monitors Storybook UI for story changes
 * Since React Native Storybook doesn't emit channel events, we need to
 * hook into the component itself to detect story changes
 */

import React, { useEffect, useRef } from 'react';
import { setCurrentStoryId } from '../../getCurrentVariant';

interface StorybookWrapperProps {
  children: React.ReactElement;
}

/**
 * Wraps the Storybook UI component to detect story changes
 * by monitoring its props and internal state
 */
export function StorybookWrapper({ children }: StorybookWrapperProps): React.ReactElement {
  const prevPropsRef = useRef<any>(null);
  
  useEffect(() => {
    // Try to access the Storybook component's internal state
    const checkStoryChange = () => {
      try {
        const globalAny = global as any;
        
        // Method 1: Check if Storybook stores current story in a global
        if (globalAny.__STORYBOOK_CURRENT_STORY__) {
          const storyId = globalAny.__STORYBOOK_CURRENT_STORY__;
          setCurrentStoryId(storyId);
          console.log('[SHERLO:wrapper] Found story in global:', storyId);
        }
        
        // Method 2: Check view object
        if (globalAny.view) {
          const view = globalAny.view;
          // Try various properties
          const storyId = view._selectedStoryId || view.selectedStoryId || 
                         view._currentStoryId || view.currentStoryId ||
                         view._currentStory?.id || view.currentStory?.id ||
                         null;
          if (storyId) {
            setCurrentStoryId(storyId);
            console.log('[SHERLO:wrapper] Found story in view:', storyId);
          }
        }
        
        // Method 3: Check if children has props that contain story info
        // This is a React component, so we can't directly access its state
        // But we can check if it re-renders with different props
      } catch (e: any) {
        console.warn('[SHERLO:wrapper] Error checking story:', e?.message || e);
      }
    };
    
    // Check immediately
    checkStoryChange();
    
    // Poll periodically
    const interval = setInterval(checkStoryChange, 100);
    
    return () => clearInterval(interval);
  }, []);
  
  // Monitor children props for changes
  useEffect(() => {
    if (children && children.props) {
      const currentProps = children.props;
      if (prevPropsRef.current !== currentProps) {
        console.log('[SHERLO:wrapper] Storybook props changed:', Object.keys(currentProps));
        prevPropsRef.current = currentProps;
      }
    }
  }, [children]);
  
  return children;
}

