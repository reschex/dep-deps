package com.example;

public class IntraClass {
    public void process() {
        this.validate();
    }

    public void validate() {
        check();
    }

    private void check() {
    }
}
