<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Plugin\Checkout;

use Magento\Checkout\Block\Checkout\LayoutProcessor;
use Magento\Store\Model\StoreManagerInterface;
use Vaimo\GoogleAddressSearchV2\Model\Config;

/**
 * Marks the first street line of checkout address forms so the frontend can attach address search
 * on first focus, without polling the DOM or hardcoding component paths in JavaScript.
 *
 * Shipping: any "shipping-address-fieldset". Billing: every "form-fields" container, which covers
 * the per-payment-method forms and the shared billing form on the payment page.
 */
class MarkAddressSearchFields
{
    public const CSS_CLASS = 'vaimo-gas-v2';

    private const FORMS_BY_CONTAINER = [
        'shipping-address-fieldset' => 'checkout_shipping',
        'form-fields' => 'checkout_billing',
    ];

    public function __construct(
        private readonly Config $config,
        private readonly StoreManagerInterface $storeManager
    ) {
    }

    /**
     * @param array<string, mixed> $jsLayout
     * @return array<string, mixed>
     */
    public function afterProcess(LayoutProcessor $subject, array $jsLayout): array
    {
        $storeId = (int)$this->storeManager->getStore()->getId();

        if (!$this->config->isActive($storeId)) {
            return $jsLayout;
        }

        $forms = array_intersect(self::FORMS_BY_CONTAINER, $this->config->getEnabledForms($storeId));

        if ($forms !== []) {
            $this->mark($jsLayout, $forms);
        }

        return $jsLayout;
    }

    /**
     * @param array<string, mixed> $node
     * @param array<string, string> $forms Container key => form code
     */
    private function mark(array &$node, array $forms): void
    {
        foreach ($node as $key => &$child) {
            if (!is_array($child)) {
                continue;
            }

            if (is_string($key) && isset($forms[$key]) && isset($child['children']['street']['children'][0])) {
                $line = &$child['children']['street']['children'][0];
                $line['additionalClasses'] = $this->addClass($line['additionalClasses'] ?? '');
                $line['config']['vaimoGasV2Form'] = $forms[$key];
                unset($line);
            }

            $this->mark($child, $forms);
        }
    }

    private function addClass(mixed $classes): string|array
    {
        if (is_array($classes)) {
            $classes[self::CSS_CLASS] = true;

            return $classes;
        }

        $list = array_filter(explode(' ', (string)$classes), 'strlen');

        return implode(' ', array_unique([...$list, self::CSS_CLASS]));
    }
}
