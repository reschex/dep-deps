package com.example;

public class Service {
    private Repository repository;

    public Service(Repository repository) {
        this.repository = repository;
    }

    public void processOrder(String orderId) {
        if (orderId != null) {
            repository.save(orderId);
        }
    }

    public void validate(String input) {
        if (input == null) {
            throw new IllegalArgumentException("null");
        }
    }
}
