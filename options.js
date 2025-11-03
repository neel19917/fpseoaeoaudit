/**
 * Options page script for SEO & AEO Auditor.
 * Handles API key and model configuration.
 */

const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('model');
const verboseLoggingCheckbox = document.getElementById('verboseLogging');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const toggleKeyBtn = document.getElementById('toggleKey');
const statusDiv = document.getElementById('status');

let isKeyVisible = false;

/**
 * Shows a status message.
 */
function showStatus(message, isError = false) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${isError ? 'error' : 'success'}`;
  setTimeout(() => {
    statusDiv.className = 'status';
  }, 3000);
}

/**
 * Masks the API key for display (shows first 8 and last 4 chars).
 */
function maskKey(key) {
  if (!key || key.length < 12) {
    return '';
  }
  return key.substring(0, 8) + '...' + key.substring(key.length - 4);
}

/**
 * Toggles API key visibility.
 */
function toggleKeyVisibility() {
  isKeyVisible = !isKeyVisible;
  
  if (isKeyVisible) {
    apiKeyInput.type = 'text';
    toggleKeyBtn.textContent = 'Hide';
  } else {
    apiKeyInput.type = 'password';
    toggleKeyBtn.textContent = 'Show';
  }
}

/**
 * Loads saved settings.
 */
async function loadSettings() {
  try {
    // Try sync storage first
    let result = await chrome.storage.sync.get(['apiKey', 'model', 'verboseLogging']);
    
    // Fallback to local storage if sync is empty
    if (!result.apiKey) {
      const localResult = await chrome.storage.local.get(['apiKey', 'model', 'verboseLogging']);
      if (localResult.apiKey) {
        result = localResult;
        console.log('[Options] Loaded from local storage (sync unavailable or empty)');
        
        // Try to migrate to sync
        try {
          await chrome.storage.sync.set({
            apiKey: localResult.apiKey,
            model: localResult.model,
            verboseLogging: localResult.verboseLogging
          });
          console.log('[Options] Migrated settings to sync storage');
        } catch (e) {
          console.warn('[Options] Could not migrate to sync:', e);
        }
      }
    }
    
    console.log('[Options] Loaded settings - API key present:', !!result.apiKey, 'Length:', result.apiKey?.length || 0);
    
    if (result.apiKey) {
      // Show masked version by default
      apiKeyInput.value = isKeyVisible ? result.apiKey : maskKey(result.apiKey);
    } else {
      apiKeyInput.value = '';
    }
    
    if (result.model) {
      modelSelect.value = result.model;
    }
    
    // Load verbose logging setting
    verboseLoggingCheckbox.checked = result.verboseLogging || false;
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings: ' + error.message, true);
  }
}

/**
 * Saves settings.
 */
async function saveSettings() {
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const verboseLogging = verboseLoggingCheckbox.checked;

  // If the input shows masked key (contains "..."), don't save anything new
  // User needs to reveal the key first or paste a new one
  if (apiKey.includes('...')) {
    // Check if this is actually the masked version of the current key
    // Try both sync and local storage
    let currentKey = await chrome.storage.sync.get(['apiKey']);
    if (!currentKey.apiKey) {
      currentKey = await chrome.storage.local.get(['apiKey']);
    }
    
    if (currentKey.apiKey) {
      const maskedCurrent = maskKey(currentKey.apiKey);
      if (apiKey === maskedCurrent) {
        // User hasn't changed the key, just save model and verbose setting
        try {
          await chrome.storage.sync.set({ model: model, verboseLogging: verboseLogging });
          await chrome.storage.local.set({ model: model, verboseLogging: verboseLogging });
          showStatus('Settings saved successfully!');
        } catch (error) {
          showStatus('Failed to save settings: ' + error.message, true);
        }
        return;
      }
    }
    showStatus('Please reveal or enter a new API key before saving.', true);
    return;
  }

  // If empty, clear the key (allow clearing)
  // Trim whitespace to prevent accidental spaces
  let keyToSave = (apiKey || '').trim();
  
  // Validate API key format only if provided
  if (keyToSave) {
    if (!keyToSave.startsWith('sk-ant-') && !keyToSave.startsWith('sk-ant-api-')) {
      // Some API keys might have different prefixes, so warn but don't block
      const proceed = confirm('API key doesn\'t start with expected prefix (sk-ant-). Are you sure this is correct?');
      if (!proceed) {
        return;
      }
    }
    
    // Warn if key seems too short (Anthropic keys are typically 100+ chars)
    if (keyToSave.length < 50) {
      const proceed = confirm(`API key seems unusually short (${keyToSave.length} chars). Anthropic API keys are typically longer. Continue anyway?`);
      if (!proceed) {
        return;
      }
    }
  }

  try {
    // Save to sync storage
    await chrome.storage.sync.set({
      apiKey: keyToSave,
      model: model,
      verboseLogging: verboseLogging
    });

    // Also save to local storage as backup (in case sync fails)
    await chrome.storage.local.set({
      apiKey: keyToSave,
      model: model,
      verboseLogging: verboseLogging
    });

    // Wait a moment for sync to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify it was saved (try sync first, fallback to local)
    let verify = await chrome.storage.sync.get(['apiKey', 'model', 'verboseLogging']);
    if (!verify.apiKey && keyToSave) {
      // Fallback to local if sync failed
      verify = await chrome.storage.local.get(['apiKey', 'model', 'verboseLogging']);
      console.warn('[Options] Sync storage failed, using local storage backup');
    }

    console.log('[Options] Saved API key - Length:', verify.apiKey?.length || 0, 'Matches:', verify.apiKey === keyToSave, 'Verbose:', verify.verboseLogging);
    
    if (verify.apiKey !== keyToSave && keyToSave !== '') {
      showStatus('Warning: Key may not have saved correctly. Please try again.', true);
      return;
    }

    // Update display after saving
    if (keyToSave && !isKeyVisible) {
      apiKeyInput.value = maskKey(keyToSave);
    } else if (keyToSave) {
      apiKeyInput.value = keyToSave;
    } else {
      apiKeyInput.value = '';
    }

    showStatus('Settings saved successfully!');
    
    // Verify persistence by checking again after a short delay
    setTimeout(async () => {
      const persistenceCheck = await chrome.storage.sync.get(['apiKey']);
      if (!persistenceCheck.apiKey && keyToSave) {
        const localCheck = await chrome.storage.local.get(['apiKey']);
        if (localCheck.apiKey === keyToSave) {
          console.log('[Options] Settings persisted in local storage (sync may be delayed)');
        } else {
          console.error('[Options] Settings did not persist!');
        }
      }
    }, 500);
    
  } catch (error) {
    showStatus('Failed to save settings: ' + error.message, true);
    console.error('Storage error:', error);
    
    // Try local storage as fallback
    try {
      await chrome.storage.local.set({
        apiKey: keyToSave,
        model: model,
        verboseLogging: verboseLogging
      });
      showStatus('Saved to local storage (sync unavailable). Settings may not sync across devices.');
    } catch (localError) {
      console.error('Local storage also failed:', localError);
    }
  }
}

// Event listeners
toggleKeyBtn.addEventListener('click', async () => {
  // If showing masked, load real key first
  if (!isKeyVisible && apiKeyInput.value.includes('...')) {
    // Try sync first, then local
    let result = await chrome.storage.sync.get(['apiKey']);
    if (!result.apiKey) {
      result = await chrome.storage.local.get(['apiKey']);
    }
    
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    } else {
      apiKeyInput.value = '';
    }
    toggleKeyVisibility();
  } else {
    toggleKeyVisibility();
  }
});

// Allow Enter key to save
apiKeyInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

modelSelect.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

/**
 * Tests the API key by sending a message to the background worker.
 * This avoids CORS issues since background workers aren't subject to browser CORS.
 */
async function testAPIKey() {
  // Make sure key is saved first
  const apiKey = apiKeyInput.value.trim();
  
  // If showing masked or empty, try to get from storage
  let keyToTest = apiKey;
  if (apiKey.includes('...') || !apiKey) {
    let result = await chrome.storage.sync.get(['apiKey']);
    if (!result.apiKey) {
      result = await chrome.storage.local.get(['apiKey']);
    }
    keyToTest = result.apiKey || '';
  }
  
  if (!keyToTest || keyToTest.trim() === '') {
    showStatus('No API key to test. Please enter and save your API key first.', true);
    return;
  }
  
  keyToTest = keyToTest.trim();
  
  if (!keyToTest.startsWith('sk-ant-')) {
    showStatus('API key format appears incorrect. Should start with "sk-ant-".', true);
    return;
  }
  
  showStatus('Testing API key...', false);
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  
  try {
    // Send test message to background worker, which will make the API call
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_API_KEY'
    });
    
    if (response && response.success) {
      showStatus('✓ API key is valid!', false);
    } else {
      showStatus(`✗ ${response?.error || 'API key test failed'}`, true);
    }
  } catch (error) {
    // Handle case where background worker isn't responding
    if (error.message && error.message.includes('Could not establish connection')) {
      showStatus('Extension background worker not ready. Please reload the extension and try again.', true);
    } else {
      showStatus('Failed to test API key: ' + (error.message || 'Unknown error'), true);
    }
    console.error('API test error:', error);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test API Key';
  }
}

saveBtn.addEventListener('click', saveSettings);
testBtn.addEventListener('click', testAPIKey);

// Load settings on page load
loadSettings();

