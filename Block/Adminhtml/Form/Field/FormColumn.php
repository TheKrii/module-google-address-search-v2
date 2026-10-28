<?php
/**
 * Copyright © Vaimo Group. All rights reserved.
 */
declare(strict_types=1);

namespace Vaimo\GoogleAddressSearchV2\Block\Adminhtml\Form\Field;

use Magento\Framework\View\Element\Context;
use Magento\Framework\View\Element\Html\Select;
use Vaimo\GoogleAddressSearchV2\Model\Config\Source\Forms;

class FormColumn extends Select
{
    public function __construct(
        Context $context,
        private readonly Forms $forms,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function setInputName(string $value): self
    {
        return $this->setName($value);
    }

    public function setInputId(string $value): self
    {
        return $this->setId($value);
    }

    protected function _toHtml(): string
    {
        $this->setExtraParams('style="width:110px"');

        if (!$this->getOptions()) {
            $this->addOption('', (string)__('All forms'));
            foreach ($this->forms->toOptionArray() as $option) {
                $this->addOption($option['value'], (string)$option['label']);
            }
        }

        return parent::_toHtml();
    }
}
