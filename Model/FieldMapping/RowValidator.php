<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\FieldMapping;

use Vaimo\GoogleAddressSearchV2\Model\Config\Source\Forms;

/**
 * Validates a single field-mapping row. Shared by the admin save handler and the config reader.
 */
class RowValidator
{
    private const FIELD_CODE = '/^[a-z][a-z0-9_]*(\.\d{1,2})?$/';
    private const TOKEN_PART = '/^[a-z0-9_]+(:(long|short))?$/';

    public function __construct(
        private readonly Forms $forms
    ) {
    }

    /**
     * @param array<string, mixed> $row
     * @return string[] Error messages, empty when the row is valid
     */
    public function validate(array $row): array
    {
        $errors = [];
        $form = (string)($row['form'] ?? '');
        $field = trim((string)($row['field'] ?? ''));
        $template = trim((string)($row['template'] ?? ''));
        $countries = (string)($row['countries'] ?? '');

        if ($form !== '' && !array_key_exists($form, $this->forms->getForms())) {
            $errors[] = sprintf('unknown form "%s"', $form);
        }

        if ($field === '') {
            $errors[] = 'target is required';
        } elseif (strlen($field) > 255 || str_contains($field, '<')) {
            $errors[] = 'target is too long or contains invalid characters';
        } elseif (!$this->isSelector($field) && !preg_match(self::FIELD_CODE, $field)) {
            $errors[] = sprintf(
                'target "%s" must be a field code like street.0 or city, or a CSS selector starting with #, . or [',
                $field
            );
        }

        if ($template === '' || strlen($template) > 255 || str_contains($template, '<')) {
            $errors[] = 'template is required, at most 255 characters, and must not contain "<"';
        } else {
            if (!preg_match_all('/\{([^{}]*)\}/', $template, $matches)) {
                $errors[] = 'template must contain at least one {component}';
            }
            foreach ($matches[1] ?? [] as $token) {
                foreach (explode('|', $token) as $part) {
                    if (!preg_match(self::TOKEN_PART, trim($part))) {
                        $errors[] = sprintf('invalid template token "{%s}"', $token);
                        break 2;
                    }
                }
            }
        }

        foreach (array_filter(array_map('trim', explode(',', $countries)), 'strlen') as $code) {
            if (!preg_match('/^[A-Za-z]{2}$/', $code)) {
                $errors[] = sprintf('invalid country code "%s"', $code);
                break;
            }
        }

        return $errors;
    }

    /**
     * @return string[]
     */
    public function parseCountries(string $countries): array
    {
        $codes = array_filter(array_map('trim', explode(',', $countries)), 'strlen');

        return array_values(array_unique(array_map('strtoupper', $codes)));
    }

    private function isSelector(string $field): bool
    {
        return in_array($field[0], ['#', '.', '['], true);
    }
}
