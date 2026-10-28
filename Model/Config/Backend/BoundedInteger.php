<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Model\Config\Backend;

use Magento\Framework\App\Config\Value;
use Magento\Framework\Exception\LocalizedException;

/**
 * Integer within [min, max]; the bounds are injected per field via virtual types in di.xml.
 */
class BoundedInteger extends Value
{
    public function beforeSave()
    {
        $value = trim((string)$this->getValue());
        $min = (int)$this->getData('min');
        $max = (int)$this->getData('max');

        if (!preg_match('/^\d+$/', $value) || (int)$value < $min || (int)$value > $max) {
            throw new LocalizedException(__(
                '"%1" must be a whole number between %2 and %3.',
                $this->getFieldConfig()['label'] ?? $this->getPath(),
                $min,
                $max
            ));
        }

        $this->setValue((string)(int)$value);

        return parent::beforeSave();
    }
}
