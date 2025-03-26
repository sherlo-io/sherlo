# Turbo Module Refactoring Plan

## Overview
Convert the existing React Native native module to Turbo module architecture while maintaining backward compatibility with legacy native modules for clients not using the new architecture.

## Key Requirements
- Core business logic should remain shared between legacy and new architecture implementations
- Provide a unified JavaScript API that works transparently with both architectures
- Maintain all existing functionality

## Implementation Steps

### 1. JavaScript Specification ✅
- Create TypeScript spec file (`NativeSherloModule.ts`) defining the interface for the Turbo module
- Update the module's JS interface to work with both architectures

### 2. iOS Implementation ✅
- Update the podspec file to handle both architectures using conditional configuration
- Conditionally include Turbo module headers and implementations using `RCT_NEW_ARCH_ENABLED`
- Adapt existing classes to conform to the generated specs when new architecture is enabled
- Ensure core business logic is shared between both implementations

### 3. Android Implementation ✅
- Create architecture-specific source sets in build.gradle (`oldarch` and `newarch`)
- Move shared implementation code to common files
- Create legacy implementation in `oldarch` directory
- Create Turbo module implementation in `newarch` directory
- Configure build.gradle to select the appropriate source set based on architecture

### 4. Testing Strategy
- Test with both legacy apps and new architecture apps
- Ensure all functionality works identically in both modes
- Verify JS API provides consistent behavior regardless of underlying architecture

## Implementation Progress

### Completed
1. Created TypeScript specification in `src/helpers/NativeSherloModule.ts`
2. Updated `SherloModule.ts` to work with both architectures
3. Updated podspec to use conditional configuration based on environment variables
4. Added conditional Turbo Module support to iOS implementation
5. Added source set configuration to Android's build.gradle
6. Created architecture-specific implementations for Android
7. Added codegenConfig to package.json
8. Fixed codegen issues with complex TypeScript types
9. Fixed C++ compilation issues in podspec
10. Fixed podspec syntax errors
11. Added flexible import paths to support different React Native versions
12. Completely separated the Turbo Module implementation in separate files to avoid C++ header issues in legacy mode
13. Created a bridge header file for Turbo Module imports
14. Added comprehensive header search paths to the podspec
15. Properly declared conformance to RCTTurboModule protocol in interface
16. Simplified file inclusion to completely avoid C++/ObjC compatibility issues

### TODO
1. Test with legacy apps
2. Test with new architecture apps
3. Verify feature parity between both implementations

## Issues Encountered and Solutions

### 1. Codegen Type Error
**Problem**: Codegen failed with error `UnsupportedGenericParserError: Module NativeSherloModule: Unrecognized generic type 'StorybookViewMode' in NativeModule spec`

**Solution**: 
- Modified the TypeScript spec to use only primitive types that Codegen understands
- Replaced custom types like `StorybookViewMode` with `string`
- Kept the type safety in the JavaScript wrapper by casting the values to proper types

### 2. iOS Header Import Issues
**Problem**: Compiler errors with import syntax in `SherloModule.h`

**Solution**:
- Used a cascade of #if __has_include checks to try multiple import paths
- Added fallbacks for different React Native versions and setups

### 3. C++ Compilation Errors
**Problem**: Build failures with missing C++ headers ('utility', 'optional', 'cassert', 'iosfwd')

**Solution**:
- Replaced `install_modules_dependencies` with explicit configuration
- Added proper C++ compiler flags in podspec
- Added explicit dependencies for React-Codegen, RCT-Folly, etc.
- Added header search paths for boost and other libraries

### 4. Podspec Syntax Error
**Problem**: Invalid podspec syntax when trying to update the hash - `undefined method 'pod_target_xcconfig' for #<Pod::Specification name="sherlo-react-native-storybook">`

**Solution**:
- CocoaPods requires setting the entire hash at once, not updating individual keys
- Fixed by replacing:
  ```ruby
  s.pod_target_xcconfig["KEY"] = "VALUE"
  ```
  with:
  ```ruby
  s.pod_target_xcconfig = {
    "KEY1" => "VALUE1",
    "KEY2" => "VALUE2"
  }
  ```
- Made sure to copy any existing keys when replacing the hash

### 5. Supporting Different React Native Versions
**Problem**: Import paths differ between React Native versions and setups

**Solution**:
- Used conditional compilation with multiple fallbacks for imports
- Added a cascade of #if __has_include checks to try different import paths

### 6. Persistent C++ Header Issues in Legacy Mode
**Problem**: Even with proper #ifdef guards, the compiler still tried to parse C++ code in legacy mode

**Solution**:
- Created completely separate implementation files for legacy and new architecture:
  - `SherloModule.m`: Pure Objective-C file for legacy architecture with no C++ dependencies
  - `SherloTurboModule.mm`: Objective-C++ file that's only included when building with the new architecture
- Updated podspec to conditionally include .mm files only for the new architecture

### 7. TurboModule Header Not Found
**Problem**: Build errors with 'React/RCTTurboModule.h' file not found

**Solution**:
- Created a bridge header file `SherloTurboModuleHeader.h` with all necessary imports and fallbacks
- Used a cascade of conditional compilation to try multiple import paths for the TurboModule headers
- Added additional header search paths in the podspec for all React Native components 
- Added dependencies on all React Native core packages that might contain Turbo Module headers

### 8. Missing Protocol Declaration
**Problem**: Error with `@synthesize turboModuleRegistry = _turboModuleRegistry;` - "property implementation must have its declaration in interface 'SherloModule' or one of its extensions"

**Solution**:
- Added proper protocol conformance to the SherloModule interface: `<RCTTurboModule>`
- Added fallback declarations for RCTTurboModule protocol in case the header is not found
- Made sure to provide a stub implementation of getTurboModule method from the protocol
- Added forward declaration for RCTTurboModuleRegistry protocol to avoid dependency issues

### 9. C++ Type Conflicts in Fallback Declarations
**Problem**: Compiler errors with 'expected a type' when using C++ types in Objective-C declarations

**Solution**:
- Completely simplified the file structure:
  - Made SherloModule.h a basic header with no conditional imports 
  - Created a separate TurboModule header that's only used in new architecture mode
  - Moved all C++ type references to that separate file
  - Updated the podspec to exclude TurboModule files completely in legacy mode using pattern: `"ios/!(SherloTurboModule*).{h,m}"`
- This avoids mixing C++ and Objective-C in ways that confuse the compiler

## Final Solution Structure

### Files Overview
- **SherloModule.h**: Simple Objective-C header declaring core interfaces
- **SherloModule.m**: Legacy implementation for standard React Native
- **SherloTurboModule.mm**: New architecture implementation using TurboModules
- **SherloTurboModuleHeader.h**: Dedicated header only included with new architecture
- **SherloModuleCore.h/m**: Shared implementation logic used by both architectures

### Architecture Separation Strategy
1. **Podspec Configuration**:
   - Standard architecture: `s.source_files = "ios/!(SherloTurboModule*).{h,m}"`
   - New architecture: `s.source_files = "ios/**/*.{h,m,mm}"`

2. **Conditional Compilation**:
   - Turbo Module files use `#ifdef RCT_NEW_ARCH_ENABLED` to gate C++ implementation
   - Header imports use cascading `#if __has_include` to handle different React Native versions
   - Only TurboModule files include C++ headers to prevent parsing issues

3. **Shared Core Logic**:
   - Core business logic shared in SherloModuleCore.h/m
   - Both implementations delegate to these shared methods
   - Ensures identical behavior regardless of architecture

## Testing Instructions
1. Test on a legacy React Native app:
   - Ensure all Sherlo functions work as expected
   - Verify no regressions in functionality

2. Test on a New Architecture React Native app:
   - Enable `newArchEnabled=true` in gradle.properties
   - Verify Turbo Module implementation is used
   - Confirm all functionality works correctly

## Potential Issues
- Generated code might need path adjustments depending on project structure
- Method signatures might need refinement
- The codegen file might be named differently than expected - check the generated code in node_modules after running codegen
- The getTurboModule method may need to be updated with the actual JSI class name after codegen runs
- Duplicate Objective-C implementation error may occur - if so, add #ifndef/#define guards in header files
- The TurboModule may require different header paths depending on the React Native version
