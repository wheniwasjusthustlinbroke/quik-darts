/**
 * Quik Darts - Production Build Script
 *
 * This script compiles JSX and obfuscates the JavaScript code for production deployment.
 *
 * Usage:
 *   npm run build          - Build with obfuscation
 *   npm run build:dev      - Copy without obfuscation (development)
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Configuration
const INPUT_FILE = 'index.html';
const OUTPUT_DIR = 'dist';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'index.html');

// Copyright notice to add to the output
const COPYRIGHT_NOTICE = `
/**
 * Quik Darts - Championship Edition
 * Copyright (c) ${new Date().getFullYear()} Quik Darts. All Rights Reserved.
 *
 * NOTICE: This is proprietary software. Unauthorized copying, modification,
 * distribution, or use of this software, via any medium, is strictly prohibited.
 *
 * This code is protected by copyright law and international treaties.
 * Violators will be prosecuted to the fullest extent of the law.
 */
`;

// Obfuscation options - React-safe "low" preset
// Aggressive options like controlFlowFlattening and deadCodeInjection break React
const OBFUSCATION_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,        // DISABLED - breaks React state
  deadCodeInjection: false,            // DISABLED - breaks React hooks
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,         // DISABLED - can cause issues
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,                 // DISABLED - breaks string comparisons
  stringArray: true,
  stringArrayCallsTransform: false,    // DISABLED - breaks property access
  stringArrayEncoding: [],             // No encoding - safer
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: false,  // DISABLED - breaks chains
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 0.5,           // Lower threshold
  transformObjectKeys: false,          // DISABLED - breaks React props
  unicodeEscapeSequence: false
};

function log(message) {
  console.log(`[Build] ${message}`);
}

function extractScriptContent(html) {
  // Find the babel script tag
  const scriptRegex = /<script type="text\/babel">([\s\S]*?)<\/script>/;
  const match = html.match(scriptRegex);

  if (!match) {
    throw new Error('Could not find <script type="text/babel"> tag in index.html');
  }

  return {
    fullMatch: match[0],
    scriptContent: match[1]
  };
}

function compileJSX(code) {
  log('Compiling JSX with Babel...');

  const result = babel.transformSync(code, {
    presets: ['@babel/preset-react'],
    compact: false,
    comments: false
  });

  if (!result || !result.code) {
    throw new Error('Babel compilation failed');
  }

  return result.code;
}

function obfuscateCode(code) {
  // DISABLED: Obfuscation breaks React. Just return compiled code.
  log('Skipping obfuscation (React compatibility)...');
  return code;

  // Original obfuscation (disabled):
  // const obfuscationResult = JavaScriptObfuscator.obfuscate(code, OBFUSCATION_OPTIONS);
  // return obfuscationResult.getObfuscatedCode();
}

function removeExternalBabel(html) {
  // Remove the Babel standalone script since we pre-compile
  const babelScriptRegex = /<script[^>]*babel[^>]*><\/script>\s*/gi;
  return html.replace(babelScriptRegex, '');
}

function build() {
  log('Starting production build...');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    log(`Created output directory: ${OUTPUT_DIR}`);
  }

  // Read source file
  log(`Reading ${INPUT_FILE}...`);
  let html = fs.readFileSync(INPUT_FILE, 'utf8');

  // Extract JavaScript
  const { fullMatch, scriptContent } = extractScriptContent(html);
  log(`Extracted ${scriptContent.length.toLocaleString()} characters of JavaScript`);

  // Compile JSX
  let compiledCode = compileJSX(scriptContent);
  log(`Compiled to ${compiledCode.length.toLocaleString()} characters`);

  // Obfuscate
  let finalCode = obfuscateCode(compiledCode);
  log(`Obfuscated to ${finalCode.length.toLocaleString()} characters`);

  // Add copyright notice
  finalCode = COPYRIGHT_NOTICE + finalCode;

  // Replace the babel script with regular script containing obfuscated code
  const newScript = `<script>${finalCode}</script>`;
  html = html.replace(fullMatch, newScript);

  // Remove Babel standalone (no longer needed)
  html = removeExternalBabel(html);

  // Add production comment
  const prodComment = `<!-- Production Build - ${new Date().toISOString()} -->`;
  html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n${prodComment}`);

  // Write output
  fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
  log(`Written to ${OUTPUT_FILE}`);

  // Stats
  const originalSize = fs.statSync(INPUT_FILE).size;
  const outputSize = fs.statSync(OUTPUT_FILE).size;
  const ratio = ((outputSize / originalSize) * 100).toFixed(1);

  log('');
  log('=== Build Complete ===');
  log(`Original: ${(originalSize / 1024).toFixed(1)} KB`);
  log(`Output:   ${(outputSize / 1024).toFixed(1)} KB (${ratio}% of original)`);
  log('');
  log('Deploy dist/index.html to your web server.');
}

// Run build
try {
  build();
} catch (error) {
  console.error('[Build Error]', error.message);
  process.exit(1);
}
