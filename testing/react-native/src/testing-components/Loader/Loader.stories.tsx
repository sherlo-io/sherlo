import StoryDecorator from '../../shared/StoryDecorator';
import type {Meta} from '@storybook/react';
import Loader from './Loader';

export default {
  component: Loader,
  decorators: [StoryDecorator({placement: 'center'})],
} as Meta<typeof Loader>;

export const Basic = {};
