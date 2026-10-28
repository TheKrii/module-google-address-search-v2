<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

/**
 * Supported form codes. Extend through di.xml (argument "forms") to register a new form.
 */
class Forms implements OptionSourceInterface
{
    /**
     * @param array<string, string> $forms Form code => label
     */
    public function __construct(
        private readonly array $forms = []
    ) {
    }

    /**
     * @return array<string, string>
     */
    public function getForms(): array
    {
        return $this->forms;
    }

    public function toOptionArray(): array
    {
        $options = [];
        foreach ($this->forms as $code => $label) {
            $options[] = ['value' => $code, 'label' => __($label)];
        }

        return $options;
    }
}
