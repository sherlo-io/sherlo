rm -rf node_modules || true && 
rm -rf packages/*/node_modules || true && 
rm -rf packages/*/dist || true && 
rm -rf testing/*/node_modules || true && 
rm -rf testing/*/dist || true && 
yarn cache clean && 
yarn &&
yarn build &&
cd testing/expo-storybook-8 && yarn &&
cd ../rn-storybook-7 && yarn
