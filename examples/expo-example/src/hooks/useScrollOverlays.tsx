import { useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import ListGradient from "../components/base/ListGradient/ListGradient";

const useScrollOverlays = () => {
  const [renderShadowBot, setRenderShadowBot] = useState(true);
  const [renderShadowTop, setRenderShadowTop] = useState(false);

  const onScroll = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;

    const isCloseToTop = contentOffset.y >= 60;
    setRenderShadowTop(isCloseToTop);

    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y <= contentSize.height - 60;
    setRenderShadowBot(isCloseToBottom);
  };

  const overlays = [
    <ListGradient position={"top"} visible={renderShadowTop} />,
    <ListGradient position={"bottom"} visible={renderShadowBot} />,
  ];

  return { overlays, onScroll };
};
export default useScrollOverlays;
