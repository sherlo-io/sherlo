/*
import { addons } from '@storybook/manager-api';
import React, { useRef } from 'react';
import AddonPanel from '../components/AddonPanel';

const PANEL_TITLE = 'Sherlo';
const ADDON_ID = 'sherlo';
const PANEL_ID = 'sherlo';
const PARAM_KEY = 'sherlo';

interface RegisterAddonInput {
  onPreviewStoryPress: () => void;
}

const useAddon = ({ onPreviewStoryPress }: RegisterAddonInput): void => {
  const addonInitialized = useRef(false);

  if (!addonInitialized.current) {
    addonInitialized.current = true;

    addons.register(ADDON_ID, () => {
      addons.addPanel(PANEL_ID, {
        title: PANEL_TITLE,
        render: () => <AddonPanel onPreviewStoryPress={onPreviewStoryPress} />,
        paramKey: PARAM_KEY,
      });
    });
  }
};

export default useAddon;
*/
