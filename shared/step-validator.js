/**
 * Lightweight validator for steps/{id}/step.json.
 * Checks required fields and defaultAction.type. Use at load time or in tooling.
 * Full schema: steps/step-schema.json.
 */
(function(global) {
  'use strict';

  function validateStepDefinition(data, stepId) {
    var errors = [];
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['step.json must be an object'] };
    }
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Missing or invalid id');
    } else if (stepId && data.id !== stepId) {
      errors.push('id "' + data.id + '" does not match folder "' + stepId + '"');
    }
    if (!data.label || typeof data.label !== 'string') {
      errors.push('Missing or invalid label');
    }
    if (!data.defaultAction || typeof data.defaultAction !== 'object') {
      errors.push('Missing or invalid defaultAction');
    } else {
      if (!data.defaultAction.type || typeof data.defaultAction.type !== 'string') {
        errors.push('defaultAction must include type');
      }
      if (data.id && data.defaultAction.type !== data.id) {
        errors.push('defaultAction.type must match id');
      }
    }
    if (data.formSchema != null && !Array.isArray(data.formSchema)) {
      errors.push('formSchema must be an array');
    }
    return {
      valid: errors.length === 0,
      errors: errors,
    };
  }

  if (typeof global !== 'undefined') {
    global.CFS_stepValidator = { validateStepDefinition: validateStepDefinition };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);
