/**
 * Constants for unified workflow setup: monetization, platforms, categories, upgrade plans.
 * Localized for now; eventually monetization/platforms can be loaded from the backend.
 */
(function(global) {
  'use strict';

  var MONETIZATION_OPTIONS = [
    { id: 'ads', label: 'Monetized With Ads' },
    { id: 'affiliate', label: 'Affiliate Marketing' },
    { id: 'books', label: 'Book Sales' },
    { id: 'courses', label: 'Course Sales' },
    { id: 'leads', label: 'Sell Leads' },
    { id: 'saas', label: 'Software/SAAS Sales' },
    { id: 'physical', label: 'Physical Products' },
    { id: 'services', label: 'Services' }
  ];

  var PLATFORM_OPTIONS = [
    { id: 'website', label: 'Website / Newsletter' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'pinterest', label: 'Pinterest' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'whop', label: 'Whop' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X (Twitter)' },
    { id: 'threads', label: 'Threads' },
    { id: 'reddit', label: 'Reddit' },
    { id: 'bluesky', label: 'Bluesky' },
    { id: 'gmb', label: 'Google My Business' }
  ];

  /** Platforms mentioned in upgrade plans (for autoposting). */
  var UPGRADE_PLATFORMS = [
    'TikTok', 'Instagram', 'LinkedIn', 'YouTube', 'Facebook', 'X', 'Threads',
    'Pinterest', 'Reddit', 'Bluesky', 'Google My Business'
  ];

  var UPGRADE_PLANS = [
    {
      id: 'starter',
      price: 20,
      interval: 'mo',
      name: 'Starter',
      accountsPerPlatform: 2,
      maxAccounts: 22,
      features: [
        'Autoposting on ' + UPGRADE_PLATFORMS.join(', ') + ' — up to 2 accounts per platform (22 total)',
        'Request workflows and tutorials from the community'
      ]
    },
    {
      id: 'pro',
      price: 97,
      interval: 'mo',
      name: 'Pro',
      accountsPerPlatform: 10,
      maxAccounts: 110,
      features: [
        'Autoposting on ' + UPGRADE_PLATFORMS.join(', ') + ' — up to 10 accounts per platform (110 total)',
        'Request workflows and tutorials from the community'
      ]
    }
  ];

  var WORKFLOW_CATEGORIES = [
    { id: 'social', label: 'Social Media Posts' },
    { id: 'newsletter', label: 'Email Newsletter' },
    { id: 'salesletter', label: 'Salesletter' },
    { id: 'book', label: 'Book' },
    { id: 'video', label: 'Video Tutorials' },
    { id: 'course', label: 'Course' }
  ];

  var WORKFLOW_SETUP_STORAGE_KEY = 'unifiedWorkflowSetup';

  /** Optional: set to your upgrade/checkout URL; Upgrade buttons will open it with ?plan=starter|pro */
  var UPGRADE_URL = '';

  global.WorkflowSetupConstants = {
    MONETIZATION_OPTIONS: MONETIZATION_OPTIONS,
    PLATFORM_OPTIONS: PLATFORM_OPTIONS,
    UPGRADE_PLATFORMS: UPGRADE_PLATFORMS,
    UPGRADE_PLANS: UPGRADE_PLANS,
    WORKFLOW_CATEGORIES: WORKFLOW_CATEGORIES,
    WORKFLOW_SETUP_STORAGE_KEY: WORKFLOW_SETUP_STORAGE_KEY,
    UPGRADE_URL: UPGRADE_URL
  };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
