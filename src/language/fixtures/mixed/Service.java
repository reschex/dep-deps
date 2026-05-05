package com.example;

public class Service {
    private Repository repository;

    public void run() {
        repository.save();
    }
}
