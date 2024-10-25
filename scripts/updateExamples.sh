#!/bin/bash

BASE_PROJECT='testing/expo-storybook-8'

for dir in examples/*; do
  if [ -d "$dir" ]; then
    echo "Updating $dir"
    # Remove existing src directory
    rm -rf "$dir/src"
    # Copy new src directory
    cp -R "$BASE_PROJECT/src" "$dir/"
    # Copy App.tsx file
    cp "$BASE_PROJECT/App.tsx" "$dir/App.tsx"
  fi
done

echo "All examples updated successfully!"
