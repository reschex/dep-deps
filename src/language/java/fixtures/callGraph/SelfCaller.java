package com.example;

public class SelfCaller {
    public void countdown(int n) {
        if (n > 0) {
            countdown(n - 1);
        }
    }
}
