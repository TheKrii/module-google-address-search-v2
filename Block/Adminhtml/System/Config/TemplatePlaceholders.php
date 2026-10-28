<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Block\Adminhtml\System\Config;

use Magento\Config\Block\System\Config\Form\Field;
use Magento\Framework\Data\Form\Element\AbstractElement;

/**
 * Read-only reference of the placeholders available in Field Mapping templates.
 */
class TemplatePlaceholders extends Field
{
    /**
     * Google address component types (Places API (New)) plus the module's coordinate placeholders.
     * [placeholder, description, example]
     */
    private const PLACEHOLDERS = [
        'Street' => [
            ['{street_number}', 'House or building number', '10'],
            ['{route}', 'Street name', 'Bree Street'],
            ['{route:short}', 'Street name, abbreviated', 'Bree St'],
            ['{subpremise}', 'Apartment, unit or suite', '4B'],
            ['{premise}', 'Building or complex name', 'Golden Acre'],
            ['{floor}', 'Floor', '3'],
            ['{post_box}', 'PO box', 'PO Box 123'],
        ],
        'Area' => [
            ['{neighborhood}', 'Neighbourhood', 'Gardens'],
            ['{sublocality_level_1}', 'Suburb or district', 'Cape Town City Centre'],
            ['{sublocality_level_2}', 'Smaller district within a suburb', 'Zonnebloem'],
        ],
        'City' => [
            ['{locality}', 'City or town', 'Cape Town'],
            ['{postal_town}', 'Postal town (UK, Sweden; often instead of locality)', 'London'],
            ['{administrative_area_level_3}', 'Municipality or commune (some countries)', 'Rīga'],
        ],
        'Region' => [
            ['{administrative_area_level_1}', 'State, province or region', 'Western Cape'],
            ['{administrative_area_level_1:short}', 'State or province code', 'WC'],
            ['{administrative_area_level_2}', 'County or district', 'City of Cape Town'],
        ],
        'Postcode and country' => [
            ['{postal_code}', 'Postcode', '8001'],
            ['{postal_code_suffix}', 'Postcode suffix (US ZIP+4)', '1234'],
            ['{country}', 'Country name', 'South Africa'],
            ['{country:short}', 'Two-letter country code (use for country_id)', 'ZA'],
        ],
        'Coordinates' => [
            ['{latitude}', 'Latitude, 7 decimals (also requests the place location)', '-33.9178503'],
            ['{longitude}', 'Longitude, 7 decimals (also requests the place location)', '18.4221070'],
        ],
    ];

    private const SYNTAX = [
        ['{type}', 'Long name of the component', '{route} → Bree Street'],
        ['{type:short}', 'Short name of the component', '{country:short} → ZA'],
        ['{a|b|c}', 'First one that exists', '{locality|postal_town} → Cape Town'],
        ['text', 'Anything outside braces is kept as typed', '{route} {street_number} → Bree Street 10'],
        ['missing parts', 'Left out; extra spaces and separators are removed', '{subpremise}/{street_number} → 10'],
    ];

    private const TARGETS = [
        ['street.0, street.1', 'Street lines 1 and 2'],
        ['city, postcode, company, telephone', 'Address fields by their Magento code'],
        ['country_id', 'Country dropdown; use {country:short}'],
        ['region', 'State/Province dropdown, or the region text field when the country has no list'],
        ['latitude, longitude, any_custom_attribute', 'Custom address attributes by code'],
        ['#id, .class, [name="..."]', 'CSS selector inside the form, for fields without a standard code'],
    ];

    public function render(AbstractElement $element): string
    {
        return '<tr id="row_' . $this->escapeHtmlAttr($element->getHtmlId()) . '"><td class="label"></td>'
            . '<td class="value" colspan="3">' . $this->renderReference() . '</td></tr>';
    }

    private function renderReference(): string
    {
        // Fixed width with wrapping cells so the reference never widens the config form's own columns
        $html = '<details class="vaimo-gas-v2-placeholders" style="max-width:640px"><summary style="cursor:pointer"><strong>'
            . $this->escapeHtml(__('Template placeholders reference'))
            . '</strong> <span style="color:#666">(' . $this->escapeHtml(__('click to show or hide')) . ')</span></summary>';

        $html .= $this->table(__('Syntax'), [__('Write'), __('Meaning'), __('Example')], self::SYNTAX);

        foreach (self::PLACEHOLDERS as $group => $rows) {
            $html .= $this->table(__($group), [__('Placeholder'), __('Contains'), __('Example')], $rows);
        }

        $html .= $this->table(__('Target Field values'), [__('Target'), __('Fills')], self::TARGETS);
        $html .= '<p class="note"><span>'
            . $this->escapeHtml(__('Examples show values for "10 Bree Street, Cape Town". Google returns only the components that exist for a place.'))
            . ' <a href="https://developers.google.com/maps/documentation/places/web-service/place-types#address-types" target="_blank" rel="noopener">'
            . $this->escapeHtml(__('All Google address types'))
            . '</a></span></p>';

        return $html . '</details>';
    }

    /**
     * @param array<int, array<int, string>> $rows
     */
    private function table(mixed $caption, array $headings, array $rows): string
    {
        $html = '<table class="admin__table-secondary" style="margin:12px 0 4px;width:100%;table-layout:fixed;'
            . 'overflow-wrap:anywhere"><caption style="text-align:left;font-weight:600;padding:4px 0">'
            . $this->escapeHtml((string)$caption) . '</caption><thead><tr>';

        foreach ($headings as $heading) {
            $html .= '<th>' . $this->escapeHtml((string)$heading) . '</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($rows as $row) {
            $html .= '<tr>';
            foreach ($row as $index => $cell) {
                $text = $this->escapeHtml($index === 1 ? (string)__($cell) : $cell);
                $html .= '<td>' . ($index === 0 ? '<code>' . $text . '</code>' : $text) . '</td>';
            }
            $html .= '</tr>';
        }

        return $html . '</tbody></table>';
    }
}
