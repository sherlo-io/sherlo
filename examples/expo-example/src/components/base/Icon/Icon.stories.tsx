import type { Meta } from '@storybook/react';
import Icon from './Icon';
import StoryDecorator from '../../../decorators/StoryDecorator';
import { StyleSheet, Text, View } from 'react-native';
import { ReactNode } from 'react';

export default {
  component: Icon,
  decorators: [StoryDecorator],
} as Meta<typeof Icon>;

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textColor: {
    color: 'white',
  },
  iconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const Primary = {
  render: () => (
    <View>
      <IconDecorator name="Arrow Right">
        <Icon name="arrowRight" size="medium" />
      </IconDecorator>
      <IconDecorator name="Arrow Left">
        <Icon name="arrowLeft" size="big" />
      </IconDecorator>

      {/* 
      <View style={styles.iconContainer}>
        <Icon name="arrowDown" size="small" />
        <Text style={styles.textColor}>Arrow Down</Text>
      </View>

      <View style={styles.iconContainer}>
        <Icon name="cog" size="big" />
        <Text style={styles.textColor}>Cog</Text>
      </View>

      <View style={styles.iconContainer}>
        <Icon name="account" size="big" />
        <Text style={styles.textColor}>Account</Text>
      </View>

      <View style={styles.iconContainer}>
        <Icon name="sliders" size="big" />
        <Text style={styles.textColor}>Sliders</Text>
      </View>

      <View style={styles.iconContainer}>
        <Icon name="plusBox" size="big" />
        <Text style={styles.textColor}>Plus Box</Text>
      </View>

      <View style={styles.iconContainer}>
        <Icon name="splotch" size="big" />
        <Text style={styles.textColor}>Splotch</Text>
      </View>

      <View style={styles.iconContainer}>
        <Icon name="plus" size="big" />
        <Text style={styles.textColor}>Plus</Text>
      </View>

      <View style={styles.iconContainer}>
        <Icon name="minus" size="big" />
        <Text style={styles.textColor}>Minus</Text>
      </View> */}
    </View>
  ),
};

const IconDecorator = ({ children, name }: { children: ReactNode; name: string }) => (
  <View style={styles.container}>
    <View style={styles.iconContainer}>{children}</View>
    <Text style={styles.textColor}>{name}</Text>
  </View>
);
