#!/bin/bash

BASE_PROJECT='testing/expo-storybook-8'
EXCLUDE_IN_EXAMPLES=("eas.json" "node_modules" "package.json" "README.md" "builds" "dist" ".expo" "scripts" ".github" "src/testing-components")
EXCLUDE_IN_TESTING=("node_modules" "package.json" "README.md" "builds" "dist" ".expo" "metro.config.js" ".storybook")

# Function to update a directory
update_directory() {
  local dir="$1"
  local excludeCopy=("${!2}")
  echo "Updating $dir"

  # Create exclude file for rsync
  local exclude_file=$(mktemp)
  for item in "${excludeCopy[@]}"; do
    echo "$item" >> "$exclude_file"
  done

  echo "Debug: Content of exclude file:"
  cat "$exclude_file"

  # Use rsync with debug flag
  rsync -av --delete --exclude-from="$exclude_file" "$BASE_PROJECT/" "$dir/"

  # Clean up temporary file
  rm "$exclude_file"
}

# Update examples/* directories
for dir in examples/*; do
  if [ -d "$dir" ]; then
    update_directory "$dir" EXCLUDE_IN_EXAMPLES[@]
  fi
done

# Update testing/expo-storybook-7 directory
update_directory "testing/expo-storybook-7" EXCLUDE_IN_TESTING[@]

echo "All examples and testing/expo-storybook-7 updated successfully!"
