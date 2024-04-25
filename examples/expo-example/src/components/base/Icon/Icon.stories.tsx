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
  args: { name: 'arrowRight', size: 'big' },
  decorators: [StoryDecorator],
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
      <Icon name="arrowRight" size="small" />
      <Icon name="arrowRight" size="medium" />
      <Icon name="arrowRight" size="big" />
    </View>
  ),
  decorators: [StoryDecorator],
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/MQKuH5Z7IrlnltVk4ox3oB/Sherlo-Expo-Example?type=design&node-id=2017-22&mode=design&t=Nw5xn7GoX2Yayamq-4',
    },
  },
};

const icons = [
  <Icon name="arrowRight" size="big" />,
  <Icon name="arrowLeft" size="big" />,
  <Icon name="arrowDown" size="big" />,
  <Icon name="sliders" size="big" />,
  <Icon name="splotch" size="big" />,
  <Icon name="cog" size="big" />,
  <Icon name="plusBox" size="big" />,
  <Icon name="account" size="big" />,
  <Icon name="plus" size="big" />,
  <Icon name="minus" size="big" />,
];

export const Icons: Story = {
  render: () => <GridDecorator items={icons} columns={4} />,
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
