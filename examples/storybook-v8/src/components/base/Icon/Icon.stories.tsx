import type { Meta, StoryObj } from '@storybook/react';
import Icon from './Icon';
import StoryDecorator from '../../../decorators/StoryDecorator';
import { StyleSheet, View } from 'react-native';
import GridDecorator from 'decorators/GridDecorator';

const meta: Meta<typeof Icon> = {
  component: Icon,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: 'arrowRight', size: 'big', isActive: true },
  decorators: [StoryDecorator({ placement: 'center' })],
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};

export const Sizes: Story = {
  render: () => (
    <View style={styles.sizesContainer}>
      <Icon name="arrowRight" size="small" isActive={true} />
      <Icon name="arrowRight" size="medium" isActive={true} />
      <Icon name="arrowRight" size="big" isActive={true} />
    </View>
  ),
  decorators: [StoryDecorator({ placement: 'center' })],
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};

const iconsActive = [
  <Icon name="arrowRight" size="big" isActive={true} />,
  <Icon name="arrowLeft" size="big" isActive={true} />,
  <Icon name="arrowDown" size="big" isActive={true} />,
  <Icon name="sliders" size="big" isActive={true} />,
  <Icon name="splotch" size="big" isActive={true} />,
  <Icon name="cog" size="big" isActive={true} />,
  <Icon name="plusBox" size="big" isActive={true} />,
  <Icon name="account" size="big" isActive={true} />,
  <Icon name="plus" size="big" isActive={true} />,
  <Icon name="minus" size="big" isActive={true} />,
];

export const IconsActive: Story = {
  render: () => <GridDecorator items={iconsActive} columns={4} />,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};

const iconsInactive = [
  <Icon name="arrowRight" size="big" isActive={false} />,
  <Icon name="arrowLeft" size="big" isActive={false} />,
  <Icon name="arrowDown" size="big" isActive={false} />,
  <Icon name="sliders" size="big" isActive={false} />,
  <Icon name="splotch" size="big" isActive={false} />,
  <Icon name="cog" size="big" isActive={false} />,
  <Icon name="plusBox" size="big" isActive={false} />,
  <Icon name="account" size="big" isActive={false} />,
  <Icon name="plus" size="big" isActive={false} />,
  <Icon name="minus" size="big" isActive={false} />,
];

export const IconsInactive: Story = {
  render: () => <GridDecorator items={iconsInactive} columns={4} />,
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};

const styles = StyleSheet.create({
  sizesContainer: {
    width: 200,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
