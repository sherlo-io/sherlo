import filePathInput from './filePathInput';

async function main() {
  console.log('File Path Input Prompt Prototype\n');
  console.log('Instructions:');
  console.log('- Type a file path (absolute or relative)');
  console.log('- Press TAB for autocomplete');
  console.log('- Press ENTER to submit');
  console.log('- Directories are shown in blue and end with /');
  console.log('- Try: ./ or ~/ or absolute paths\n');

  const result = await filePathInput({
    message: 'Enter path to iOS build (.app, .tar.gz):',
    validate: (value: string) => {
      if (!value || value.trim() === '') {
        return 'Path is required';
      }
      return true;
    },
  });

  console.log(`\nSelected: ${result}`);
  console.log('Prototype test complete!');
}

main().catch(console.error);
