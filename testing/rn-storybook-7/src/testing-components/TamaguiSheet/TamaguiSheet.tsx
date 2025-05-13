import { ChevronDown, ChevronUp } from '@tamagui/lucide-icons';
import type { SheetProps } from '@tamagui/sheet';
import { Sheet } from '@tamagui/sheet';
import React, { memo } from 'react';
import { Button, Input, YStack } from 'tamagui';

const spModes = ['percent', 'constant', 'fit', 'mixed'] as const;
type SnapPointsMode = (typeof spModes)[number];
type SheetType = 'modal' | 'inline';

type TamaguiSheetProps = {
  type?: SheetType;
  mode?: SnapPointsMode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  mixedFitDemo?: boolean;
  native?: boolean;
};

const TamaguiSheet = ({
  type = 'modal',
  mode = 'percent',
  open = false,
  onOpenChange,
  mixedFitDemo = false,
  native = false,
}: TamaguiSheetProps) => {
  const [position, setPosition] = React.useState(0);
  const [innerOpen, setInnerOpen] = React.useState(false);

  const isPercent = mode === 'percent';
  const isConstant = mode === 'constant';
  const isFit = mode === 'fit';
  const snapPoints = isPercent
    ? [85, 50, 25]
    : isConstant
    ? [256, 190]
    : isFit
    ? undefined
    : mixedFitDemo
    ? ['fit', 110]
    : ['80%', 256, 190];

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange?.(newOpen);
  };

  return (
    <Sheet
      forceRemoveScrollEnabled={open}
      modal={type === 'modal'}
      open={open}
      native={native}
      onOpenChange={handleOpenChange}
      snapPoints={snapPoints}
      snapPointsMode={mode}
      dismissOnSnapToBottom
      position={position}
      onPositionChange={setPosition}
      zIndex={100_000}
      animation="medium"
    >
      <Sheet.Overlay
        animation="lazy"
        backgroundColor="$shadow6"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />

      <Sheet.Handle />
      <Sheet.Frame padding="$4" justifyContent="center" alignItems="center" gap="$5">
        <SheetContents
          modal={type === 'modal'}
          isPercent={isPercent}
          innerOpen={innerOpen}
          setInnerOpen={setInnerOpen}
          setOpen={handleOpenChange}
        />
      </Sheet.Frame>
    </Sheet>
  );
};

// in general good to memoize the contents to avoid expensive renders during animations
const SheetContents = memo(({ modal, isPercent, innerOpen, setInnerOpen, setOpen }: any) => {
  return (
    <>
      <Button size="$6" circular icon={ChevronDown} onPress={() => setOpen(false)} />
      <Input width={200} />
      {modal && isPercent && (
        <>
          <InnerSheet open={innerOpen} onOpenChange={setInnerOpen} />
          <Button size="$6" circular icon={ChevronUp} onPress={() => setInnerOpen(true)} />
        </>
      )}
    </>
  );
});

function InnerSheet(props: SheetProps) {
  return (
    <Sheet animation="medium" modal snapPoints={[90]} dismissOnSnapToBottom {...props}>
      <Sheet.Overlay
        animation="medium"
        backgroundColor="$shadow2"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />

      <Sheet.Handle />
      <Sheet.Frame flex={1} justifyContent="center" alignItems="center" gap="$5">
        <Sheet.ScrollView>
          <YStack padding="$5" gap="$8">
            <Button
              size="$6"
              circular
              alignSelf="center"
              icon={ChevronDown}
              onPress={() => props.onOpenChange?.(false)}
            />
          </YStack>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  );
}

export default TamaguiSheet;
