<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Encryption\EncryptorInterface;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;
use Vaimo\GoogleAddressSearchV2\Model\FieldMapping\RowValidator;

/**
 * Typed, validated access to the module configuration.
 *
 * Values are clamped on read as well as validated on save, so a value written directly
 * to core_config_data or config.php can never produce an unsafe frontend configuration.
 */
class Config
{
    public const SECTION = 'vaimo_google_address_search_v2';
    public const LEGACY_V1_ACTIVE_PATH = 'gas_settings/google_address_search/active';
    public const MAX_REGION_CODES = 15;
    public const MAX_PRIMARY_TYPES = 5;

    private const ENABLED = 'general/enabled';
    private const FORMS = 'general/forms';
    private const DEBUG = 'general/debug';
    private const API_KEY = 'google_api/browser_api_key';
    private const MAPS_VERSION = 'google_api/maps_js_version';
    private const MIN_CHARS = 'search/min_chars';
    private const DEBOUNCE_MS = 'search/debounce_ms';
    private const MIN_INTERVAL_MS = 'search/min_interval_ms';
    private const MAX_SUGGESTIONS = 'search/max_suggestions';
    private const PRIMARY_TYPES = 'search/primary_types';
    private const COUNTRY_MODE = 'search/country_mode';
    private const COUNTRIES = 'search/countries';
    private const LANGUAGE = 'search/language';
    private const REGION = 'search/region';
    private const SESSION_TIMEOUT_S = 'search/session_timeout_s';
    private const SKIP_DEAD_PREFIXES = 'search/skip_dead_prefixes';
    private const DISABLE_AUTOFILL = 'search/disable_browser_autofill';
    private const POPULATE_FIELDS = 'fill/populate_fields';
    private const MISSING_COMPONENT = 'fill/missing_component';
    private const ON_CLEAR = 'fill/on_clear';
    private const FIELD_MAPPING = 'fill/field_mapping';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly EncryptorInterface $encryptor,
        private readonly RowValidator $rowValidator,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Enabled, configured, and not superseded by the legacy V1 module for this store view.
     */
    public function isActive(int|string|null $storeId = null): bool
    {
        return $this->isEnabled($storeId)
            && $this->getBrowserApiKey($storeId) !== ''
            && !$this->isLegacyModuleActive($storeId);
    }

    public function isEnabled(int|string|null $storeId = null): bool
    {
        return $this->getFlag(self::ENABLED, $storeId);
    }

    public function isLegacyModuleActive(int|string|null $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::LEGACY_V1_ACTIVE_PATH, ScopeInterface::SCOPE_STORE, $storeId);
    }

    /**
     * @return string[]
     */
    public function getEnabledForms(int|string|null $storeId = null): array
    {
        return $this->getList(self::FORMS, $storeId);
    }

    public function isFormEnabled(string $form, int|string|null $storeId = null): bool
    {
        return in_array($form, $this->getEnabledForms($storeId), true);
    }

    public function isDebug(int|string|null $storeId = null): bool
    {
        return $this->getFlag(self::DEBUG, $storeId);
    }

    public function getBrowserApiKey(int|string|null $storeId = null): string
    {
        $value = trim($this->getString(self::API_KEY, $storeId));

        return $value === '' ? '' : trim($this->encryptor->decrypt($value));
    }

    public function getMapsJsVersion(int|string|null $storeId = null): string
    {
        $value = $this->getString(self::MAPS_VERSION, $storeId);

        return in_array($value, ['weekly', 'quarterly', 'beta'], true) ? $value : 'quarterly';
    }

    public function getMinChars(int|string|null $storeId = null): int
    {
        return $this->getInt(self::MIN_CHARS, $storeId, 1, 20, 3);
    }

    public function getDebounceMs(int|string|null $storeId = null): int
    {
        return $this->getInt(self::DEBOUNCE_MS, $storeId, 0, 2000, 300);
    }

    public function getMinIntervalMs(int|string|null $storeId = null): int
    {
        return $this->getInt(self::MIN_INTERVAL_MS, $storeId, 0, 5000, 0);
    }

    public function getMaxSuggestions(int|string|null $storeId = null): int
    {
        return $this->getInt(self::MAX_SUGGESTIONS, $storeId, 1, 5, 5);
    }

    public function getSessionTimeoutSeconds(int|string|null $storeId = null): int
    {
        return $this->getInt(self::SESSION_TIMEOUT_S, $storeId, 30, 600, 180);
    }

    /**
     * @return string[]
     */
    public function getPrimaryTypes(int|string|null $storeId = null): array
    {
        $types = array_filter(
            $this->getList(self::PRIMARY_TYPES, $storeId),
            static fn (string $type): bool => (bool)preg_match('/^[a-z0-9_]+$/', $type)
        );

        return array_slice(array_values($types), 0, self::MAX_PRIMARY_TYPES);
    }

    public function getCountryMode(int|string|null $storeId = null): string
    {
        $value = $this->getString(self::COUNTRY_MODE, $storeId);

        return in_array($value, ['form', 'fixed', 'allowed', 'none'], true) ? $value : 'form';
    }

    /**
     * @return string[] Upper-case ISO 3166-1 alpha-2 codes, at most 15
     */
    public function getRestrictedCountries(int|string|null $storeId = null): array
    {
        return $this->normalizeCountries($this->getList(self::COUNTRIES, $storeId));
    }

    /**
     * @return string[] Store allowed countries, or [] when there are too many to send to Google
     */
    public function getAllowedCountries(int|string|null $storeId = null): array
    {
        $countries = $this->normalizeCountries($this->getList('general/country/allow', $storeId, false), PHP_INT_MAX);

        return count($countries) <= self::MAX_REGION_CODES ? $countries : [];
    }

    public function getLanguage(int|string|null $storeId = null): string
    {
        $value = $this->getString(self::LANGUAGE, $storeId);
        if ($value === '') {
            $locale = (string)$this->scopeConfig->getValue('general/locale/code', ScopeInterface::SCOPE_STORE, $storeId);
            $value = str_replace('_', '-', $locale);
        }

        return preg_match('/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})?$/', $value) ? $value : '';
    }

    public function getRegion(int|string|null $storeId = null): string
    {
        $value = $this->getString(self::REGION, $storeId);
        if ($value === '') {
            $value = (string)$this->scopeConfig->getValue('general/country/default', ScopeInterface::SCOPE_STORE, $storeId);
        }

        return preg_match('/^[A-Za-z]{2}$/', $value) ? strtolower($value) : '';
    }

    public function isSkipDeadPrefixes(int|string|null $storeId = null): bool
    {
        return $this->getFlag(self::SKIP_DEAD_PREFIXES, $storeId);
    }

    public function isDisableBrowserAutofill(int|string|null $storeId = null): bool
    {
        return $this->getFlag(self::DISABLE_AUTOFILL, $storeId);
    }

    public function isPopulateFields(int|string|null $storeId = null): bool
    {
        return $this->getFlag(self::POPULATE_FIELDS, $storeId);
    }

    public function getMissingComponentBehavior(int|string|null $storeId = null): string
    {
        return $this->getString(self::MISSING_COMPONENT, $storeId) === 'keep' ? 'keep' : 'clear';
    }

    public function getOnClearBehavior(int|string|null $storeId = null): string
    {
        return $this->getString(self::ON_CLEAR, $storeId) === 'clear_filled' ? 'clear_filled' : 'keep';
    }

    /**
     * @return array<int, array{form: string, countries: string[], field: string, template: string}>
     */
    public function getFieldMappings(int|string|null $storeId = null): array
    {
        $raw = $this->getString(self::FIELD_MAPPING, $storeId);
        if ($raw === '') {
            return [];
        }

        try {
            $rows = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            $this->logger->warning('Vaimo_GoogleAddressSearchV2: field mapping configuration is not valid JSON.');

            return [];
        }

        $result = [];
        foreach (is_array($rows) ? $rows : [] as $row) {
            if (!is_array($row) || $this->rowValidator->validate($row) !== []) {
                continue;
            }
            $result[] = [
                'form' => (string)($row['form'] ?? ''),
                'countries' => $this->rowValidator->parseCountries((string)($row['countries'] ?? '')),
                'field' => trim((string)$row['field']),
                'template' => trim((string)$row['template']),
            ];
        }

        if (count($result) !== count(is_array($rows) ? $rows : [])) {
            $this->logger->warning('Vaimo_GoogleAddressSearchV2: invalid field mapping rows were ignored.');
        }

        return $result;
    }

    /**
     * @param string[] $codes
     * @return string[]
     */
    private function normalizeCountries(array $codes, int $limit = self::MAX_REGION_CODES): array
    {
        $codes = array_unique(array_map('strtoupper', array_filter(
            $codes,
            static fn (string $code): bool => (bool)preg_match('/^[A-Za-z]{2}$/', $code)
        )));

        return array_slice(array_values($codes), 0, $limit);
    }

    private function getString(string $path, int|string|null $storeId): string
    {
        return (string)$this->scopeConfig->getValue(self::SECTION . '/' . $path, ScopeInterface::SCOPE_STORE, $storeId);
    }

    private function getFlag(string $path, int|string|null $storeId): bool
    {
        return $this->scopeConfig->isSetFlag(self::SECTION . '/' . $path, ScopeInterface::SCOPE_STORE, $storeId);
    }

    private function getInt(string $path, int|string|null $storeId, int $min, int $max, int $default): int
    {
        $value = $this->getString($path, $storeId);
        if (!is_numeric($value)) {
            return $default;
        }

        return max($min, min($max, (int)$value));
    }

    /**
     * @return string[]
     */
    private function getList(string $path, int|string|null $storeId, bool $inSection = true): array
    {
        $value = $inSection
            ? $this->getString($path, $storeId)
            : (string)$this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE, $storeId);

        return array_values(array_filter(array_map('trim', explode(',', $value)), 'strlen'));
    }
}
