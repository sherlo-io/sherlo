#!/bin/bash

BASE_PROJECT='testing/expo-storybook-8'
EXCLUDE_IN_EXAMPLES=("package.json" "README.md" "builds" "dist" ".expo" "scripts" ".github")
EXCLUDE_IN_TESTING=("package.json" "README.md" "builds" "dist" ".expo" "metro.config.js")

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

  # Use rsync to copy files, including hidden ones, and delete files not in source
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
