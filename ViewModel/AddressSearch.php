<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\ViewModel;

use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\StoreManagerInterface;
use Vaimo\GoogleAddressSearchV2\Model\Config;

/**
 * Builds the frontend configuration for the address search bootstrap.
 *
 * Only the browser key leaves the server; it is required by the Maps JavaScript API.
 */
class AddressSearch implements ArgumentInterface
{
    public const ADAPTER_DOM = 'dom-form';
    public const ADAPTER_UI = 'ui-form';

    public function __construct(
        private readonly Config $config,
        private readonly StoreManagerInterface $storeManager
    ) {
    }

    /**
     * @param array<int|string, array{selector?: string, adapter?: string, form?: string}> $targets
     * @param bool $configOnly Output the configuration without layout targets, for fields registered from
     *                         JavaScript with bootstrap.addTarget()
     * @return array<string, mixed>|null Null when address search must not run on this page
     */
    public function getJsConfig(array $targets, bool $configOnly = false): ?array
    {
        $storeId = (int)$this->storeManager->getStore()->getId();

        if (!$this->config->isActive($storeId)) {
            return null;
        }

        $forms = $this->config->getEnabledForms($storeId);
        $targets = $this->filterTargets($targets, $forms);

        if ($targets === [] && !$configOnly) {
            return null;
        }

        return [
            'targets' => $targets,
            'forms' => $forms,
            'debug' => $this->config->isDebug($storeId),
            'google' => [
                'apiKey' => $this->config->getBrowserApiKey($storeId),
                'version' => $this->config->getMapsJsVersion($storeId),
                'language' => $this->config->getLanguage($storeId),
                'region' => $this->config->getRegion($storeId),
                'primaryTypes' => $this->config->getPrimaryTypes($storeId),
            ],
            'search' => [
                'minChars' => $this->config->getMinChars($storeId),
                'debounceMs' => $this->config->getDebounceMs($storeId),
                'minIntervalMs' => $this->config->getMinIntervalMs($storeId),
                'maxSuggestions' => $this->config->getMaxSuggestions($storeId),
                'sessionTimeoutMs' => $this->config->getSessionTimeoutSeconds($storeId) * 1000,
                'skipDeadPrefixes' => $this->config->isSkipDeadPrefixes($storeId),
                'disableBrowserAutofill' => $this->config->isDisableBrowserAutofill($storeId),
                'countryMode' => $this->config->getCountryMode($storeId),
                'countries' => $this->config->getRestrictedCountries($storeId),
                'allowedCountries' => $this->config->getAllowedCountries($storeId),
            ],
            'fill' => [
                'enabled' => $this->config->isPopulateFields($storeId),
                'missingComponent' => $this->config->getMissingComponentBehavior($storeId),
                'onClear' => $this->config->getOnClearBehavior($storeId),
                'mappings' => $this->config->getFieldMappings($storeId),
            ],
            'i18n' => [
                'listLabel' => (string)__('Address suggestions'),
                'loading' => (string)__('Searching addresses…'),
                'noResults' => (string)__('No matching addresses. Keep typing or enter the address manually.'),
                'error' => (string)__('Address suggestions are unavailable right now. Please enter the address manually.'),
                'resultsOne' => (string)__('1 address suggestion available. Use the up and down arrow keys to review it.'),
                'resultsMany' => (string)__('%1 address suggestions available. Use the up and down arrow keys to review them.'),
                'filled' => (string)__('Address fields were filled in. Please review them.'),
            ],
        ];
    }

    /**
     * Safe to place inside a <script type="text/x-magento-init"> element.
     */
    public function serialize(array $data): string
    {
        return (string)json_encode(
            $data,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );
    }

    /**
     * @param array<int|string, mixed> $targets
     * @param string[] $forms
     * @return array<int, array{selector: string, adapter: string, form: string|null}>
     */
    private function filterTargets(array $targets, array $forms): array
    {
        $result = [];

        foreach ($targets as $target) {
            if (!is_array($target) || empty($target['selector'])) {
                continue;
            }

            $adapter = ($target['adapter'] ?? self::ADAPTER_DOM) === self::ADAPTER_UI ? self::ADAPTER_UI : self::ADAPTER_DOM;
            $form = isset($target['form']) && $target['form'] !== '' ? (string)$target['form'] : null;

            // UI-form targets read their form code from the component (see MarkAddressSearchFields)
            if ($form !== null && !in_array($form, $forms, true)) {
                continue;
            }
            if ($form === null && $adapter === self::ADAPTER_DOM) {
                continue;
            }

            $result[] = ['selector' => (string)$target['selector'], 'adapter' => $adapter, 'form' => $form];
        }

        return $result;
    }
}
