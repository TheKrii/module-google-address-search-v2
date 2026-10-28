<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

class CountryMode implements OptionSourceInterface
{
    public function toOptionArray(): array
    {
        return [
            ['value' => 'form', 'label' => __('Country selected in the form')],
            ['value' => 'fixed', 'label' => __('Fixed list of countries')],
            ['value' => 'allowed', 'label' => __('Store allowed countries (if 15 or fewer)')],
            ['value' => 'none', 'label' => __('No restriction')],
        ];
    }
}
